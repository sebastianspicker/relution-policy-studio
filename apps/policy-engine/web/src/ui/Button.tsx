import type { ButtonHTMLAttributes, JSX } from "react";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "compact" | "default" | "icon";

export function Button(props: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
}): JSX.Element {
  const { size = "default", variant = "secondary", ...buttonProps } = props;
  return <button {...buttonProps} data-size={size} data-variant={variant} />;
}
