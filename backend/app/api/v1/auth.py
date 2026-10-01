from fastapi import APIRouter, HTTPException, Response, status

from app.core.config import get_settings
from app.core.deps import CurrentUser, SessionDep
from app.schemas.auth import LoginRequest, RefreshRequest, TokenResponse, UserOut
from app.services import auth as auth_service
from app.services.auth import AuthError, IssuedTokens

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(tokens: IssuedTokens) -> TokenResponse:
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=tokens.expires_in,
        user=UserOut.model_validate(tokens.user),
    )


def _unauthorized(exc: AuthError) -> HTTPException:
    return HTTPException(status.HTTP_401_UNAUTHORIZED, detail=exc.code)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, session: SessionDep) -> TokenResponse:
    try:
        tokens = auth_service.login(session, body.email, body.password, get_settings())
    except AuthError as exc:
        raise _unauthorized(exc) from exc
    return _token_response(tokens)


@router.post("/refresh", response_model=TokenResponse)
def refresh(body: RefreshRequest, session: SessionDep) -> TokenResponse:
    try:
        tokens = auth_service.refresh(session, body.refresh_token, get_settings())
    except AuthError as exc:
        raise _unauthorized(exc) from exc
    return _token_response(tokens)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: RefreshRequest, user: CurrentUser, session: SessionDep) -> Response:
    auth_service.logout(session, user, body.refresh_token)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return UserOut.model_validate(user)
