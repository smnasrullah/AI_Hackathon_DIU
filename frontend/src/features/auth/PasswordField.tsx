import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type ComponentProps } from "react";
import { useTranslation } from "react-i18next";

import { FloatingField } from "./FloatingField";

type Props = Omit<ComponentProps<typeof FloatingField>, "type" | "trailing">;

/** FloatingField for passwords with a show / hide toggle. */
export const PasswordField = forwardRef<HTMLInputElement, Props>(function PasswordField(props, ref) {
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  return (
    <FloatingField
      ref={ref}
      type={show ? "text" : "password"}
      {...props}
      trailing={
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={t(show ? "login.hide" : "login.show")}
          aria-pressed={show}
          aria-controls={props.id}
          className="ap-press grid size-11 place-items-center rounded-[var(--radius-input)] text-muted hover:text-fg"
        >
          {show ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
        </button>
      }
    />
  );
});
