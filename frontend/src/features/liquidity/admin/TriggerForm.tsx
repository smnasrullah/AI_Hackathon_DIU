import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useSaveTriggerSettings } from "../../../api/hooks/helpRequests";
import type { TriggerSettingsOut } from "../../../api/types";
import { LiquidButton } from "../../../components/ui/LiquidButton";
import { toast } from "../../../components/ui/toastStore";
import { NumberField } from "./NumberField";
import { triggerSchema, type TriggerForm as Form } from "./helpSettingsSchema";

/** When the automatic search fires: look-ahead, buffer, size limits, search radius, waves and timing. */
export function TriggerForm({ data }: { data: TriggerSettingsOut }) {
  const { t } = useTranslation();
  const save = useSaveTriggerSettings();
  const schema = useMemo(
    () => triggerSchema({ number: t("liquidity.admin.number"), range: (min, max) => t("liquidity.admin.range", { min, max }) }),
    [t],
  );
  const form = useForm<Form>({ resolver: zodResolver(schema), values: { ...data } });
  const { register, handleSubmit, formState } = form;
  const e = formState.errors;
  const num = { valueAsNumber: true } as const;

  function onSubmit(values: Form): void {
    save.mutate(values, {
      onSuccess: () => toast({ tone: "success", title: t("liquidity.admin.saved") }),
      onError: () => toast({ tone: "error", title: t("liquidity.admin.saveFailed") }),
    });
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="ap-card space-y-5 p-5 shadow-soft" aria-labelledby="trigger-title">
      <h2 id="trigger-title" className="font-display text-h2 font-bold">
        {t("liquidity.admin.sections.trigger")}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t("liquidity.admin.fields.horizon.label")}
          help={t("liquidity.admin.fields.horizon.help")}
          error={e.horizon_h?.message}
          step={1}
          {...register("horizon_h", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.buffer.label")}
          help={t("liquidity.admin.fields.buffer.help")}
          error={e.buffer_pct?.message}
          step="any"
          {...register("buffer_pct", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.minShortfall.label")}
          help={t("liquidity.admin.fields.minShortfall.help")}
          error={e.min_shortfall_bdt?.message}
          step="any"
          {...register("min_shortfall_bdt", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.maxRequest.label")}
          help={t("liquidity.admin.fields.maxRequest.help")}
          error={e.max_request_bdt?.message}
          step="any"
          {...register("max_request_bdt", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.leadMargin.label")}
          help={t("liquidity.admin.fields.leadMargin.help")}
          error={e.lead_margin_h?.message}
          step="any"
          {...register("lead_margin_h", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.recentAsk.label")}
          help={t("liquidity.admin.fields.recentAsk.help")}
          error={e.recent_ask_h?.message}
          step="any"
          {...register("recent_ask_h", num)}
        />
      </div>

      <h3 className="pt-2 font-semibold">{t("liquidity.admin.sections.waves")}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t("liquidity.admin.fields.radius.label")}
          help={t("liquidity.admin.fields.radius.help")}
          error={e.radius_km?.message}
          step="any"
          {...register("radius_km", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.maxWaves.label")}
          help={t("liquidity.admin.fields.maxWaves.help")}
          error={e.max_waves?.message}
          step={1}
          {...register("max_waves", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.waveTimeout.label")}
          help={t("liquidity.admin.fields.waveTimeout.help")}
          error={e.wave_timeout_min?.message}
          step={1}
          {...register("wave_timeout_min", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.deadlineFloor.label")}
          help={t("liquidity.admin.fields.deadlineFloor.help")}
          error={e.deadline_floor_min?.message}
          step={1}
          {...register("deadline_floor_min", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.urgentWave.label")}
          help={t("liquidity.admin.fields.urgentWave.help")}
          error={e.urgent_wave_multiplier?.message}
          step="any"
          {...register("urgent_wave_multiplier", num)}
        />
        <NumberField
          label={t("liquidity.admin.fields.perTick.label")}
          help={t("liquidity.admin.fields.perTick.help")}
          error={e.max_new_per_tick?.message}
          step={1}
          {...register("max_new_per_tick", num)}
        />
      </div>

      <div className="flex justify-end">
        <LiquidButton type="submit" loading={save.isPending} disabled={save.isPending}>
          {t("liquidity.admin.save")}
        </LiquidButton>
      </div>
    </form>
  );
}
