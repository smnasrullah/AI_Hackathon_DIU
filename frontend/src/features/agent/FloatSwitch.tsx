import { Banknote, Smartphone } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { FloatType } from "../../api/types";
import { SegmentedControl } from "../../components/ui/SegmentedControl";

interface FloatSwitchProps {
  value: FloatType;
  onChange: (value: FloatType) => void;
  label?: string;
  size?: "sm" | "md";
  className?: string;
}

/** Cash / e-money choice; icons echo the float textures (notes vs phone). */
export function FloatSwitch({ value, onChange, label, size, className }: FloatSwitchProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl
      label={label ?? t("forecast.floatLabel")}
      value={value}
      onChange={onChange}
      size={size}
      className={className}
      options={[
        { value: "cash", label: t("float.cash"), icon: Banknote },
        { value: "emoney", label: t("float.emoney"), icon: Smartphone },
      ]}
    />
  );
}
