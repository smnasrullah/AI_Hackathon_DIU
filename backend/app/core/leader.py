"""Leader guard: of several processes running the same background loop, exactly one acts.

Postgres: a session-level advisory lock held on one dedicated connection. If the leader
process dies its connection closes, Postgres releases the lock, and the next process to try
becomes leader. Other databases (SQLite, local runs): an exclusive OS file lock next to the
database file, released by the OS when the holder exits. Both are non-blocking: a process that
is not the leader simply skips its turn.
"""

import logging
import os
from pathlib import Path
from typing import IO

from sqlalchemy import Connection, Engine, text
from sqlalchemy.exc import SQLAlchemyError

log = logging.getLogger(__name__)


class Leader:
    def __init__(self, engine: Engine, name: str, lock_id: int) -> None:
        self.engine, self.name, self.lock_id = engine, name, lock_id
        self._conn: Connection | None = None
        self._file: IO[bytes] | None = None

    @property
    def is_leader(self) -> bool:
        return self._conn is not None or self._file is not None

    def acquire(self) -> bool:
        """True when this process is (still) the leader. Never blocks."""
        if self.engine.dialect.name == "postgresql":
            return self._acquire_pg()
        return self._acquire_file()

    def release(self) -> None:
        if self._conn is not None:
            try:
                self._conn.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": self.lock_id})
                self._conn.close()
            except SQLAlchemyError:
                pass
            self._conn = None
        if self._file is not None:
            _unlock(self._file)
            self._file.close()
            self._file = None

    def _acquire_pg(self) -> bool:
        if self._conn is not None:
            try:  # still holding it? A dropped connection has lost the lock.
                self._conn.execute(text("SELECT 1"))
                return True
            except SQLAlchemyError:
                log.warning("%s: leader connection lost; trying to take the lock again",
                            self.name)
                self._conn = None
        conn = self.engine.connect()
        try:
            got = bool(conn.execute(text("SELECT pg_try_advisory_lock(:k)"),
                                    {"k": self.lock_id}).scalar())
            conn.commit()  # session-level lock: it outlives this transaction
        except SQLAlchemyError:
            conn.close()
            raise
        if not got:
            conn.close()
            return False
        self._conn = conn
        return True

    def _acquire_file(self) -> bool:
        if self._file is not None:
            return True
        path = _lock_path(self.engine, self.name)
        handle = open(path, "a+b")  # noqa: SIM115 - held open for as long as we lead
        if not _try_lock(handle):
            handle.close()
            return False
        self._file = handle
        return True


def _lock_path(engine: Engine, name: str) -> Path:
    db = engine.url.database
    if db and db != ":memory:":
        return Path(f"{db}.{name}.lock")
    return Path(os.environ.get("TMPDIR", "/tmp")) / f"agentpulse.{name}.lock"


def _try_lock(handle: IO[bytes]) -> bool:
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return False
    return True


def _unlock(handle: IO[bytes]) -> None:
    try:
        if os.name == "nt":
            import msvcrt

            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)
    except OSError:
        pass
