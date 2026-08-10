// TODO(v2.1): PolicyEditor is currently unused — the create_account PTB
// hardcodes empty_policy_set() regardless of the editor's output. Wire
// account::update_policies into the editor once the v2.1 contract
// changes ship.
import { useState, useEffect } from "react";
import { Input } from "../ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { parsePUSDToMist } from "../../lib/format";

interface PolicyValues {
  maxPerTransaction: string;
  maxPerMonth: string;
  minBalance: string;
  minFrequencyDays: string;
}

interface PolicyEditorProps {
  values: PolicyValues;
  onChange: (values: PolicyValues) => void;
  depositAmount?: string;
}

export function PolicyEditor({ values, onChange, depositAmount }: PolicyEditorProps) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    const newErrors: Record<string, string> = {};
    const deposit = parsePUSDToMist(depositAmount || "0");
    const minBalanceVal = parsePUSDToMist(values.minBalance || "0");

    if (minBalanceVal > 0 && deposit > 0 && minBalanceVal >= deposit) {
      newErrors.minBalance = "Minimum balance cannot exceed deposit amount";
    }

    setErrors(newErrors);
  }, [values.minBalance, depositAmount]);

  function handleChange(field: keyof PolicyValues, value: string) {
    onChange({ ...values, [field]: value });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Spending Limits</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Max per transaction</label>
            <Input
              type="number"
              placeholder="0 = no limit"
              value={values.maxPerTransaction}
              onChange={(e) => handleChange("maxPerTransaction", e.target.value)}
              min={0}
              step={0.001}
            />
            <p className="text-xs text-muted-foreground">Maximum amount for a single payment</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Max per month</label>
            <Input
              type="number"
              placeholder="0 = no limit"
              value={values.maxPerMonth}
              onChange={(e) => handleChange("maxPerMonth", e.target.value)}
              min={0}
              step={0.001}
            />
            <p className="text-xs text-muted-foreground">Total spending limit per month</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Minimum balance</label>
            <Input
              type="number"
              placeholder="0 = no minimum"
              value={values.minBalance}
              onChange={(e) => handleChange("minBalance", e.target.value)}
              min={0}
              step={0.001}
              className={errors.minBalance ? "border-red-500" : ""}
            />
            {errors.minBalance && (
              <p className="text-xs text-red-500">{errors.minBalance}</p>
            )}
            <p className="text-xs text-muted-foreground">Keep this amount in account at all times</p>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Min time between charges</label>
            <Input
              type="number"
              placeholder="0 = no minimum"
              value={values.minFrequencyDays}
              onChange={(e) => handleChange("minFrequencyDays", e.target.value)}
              min={0}
              step={1}
            />
            <p className="text-xs text-muted-foreground">Days between payment attempts</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
