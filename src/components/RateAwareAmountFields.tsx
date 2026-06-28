import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Lock, Pencil } from "lucide-react";
import { verifyMyPassword, logCodeOverride } from "@/lib/currency.functions";

interface Props {
  kind: "payment" | "withdrawal";
  defaultRate: number;
  usdValue: string;
  zwgValue: string;
  amountSource?: "usd" | "zwg" | null;
  onUsdChange: (v: string) => void;
  onZwgChange: (v: string) => void;
  onAmountSourceChange?: (source: "usd" | "zwg" | null) => void;
  onCodeChange?: (code: number, isOverride: boolean) => void;
  reference?: string;
  hideZwg?: boolean;
  singleCurrencyOnly?: boolean;
}

/**
 * Renders Code (read-only), USD, ZWG fields with auto-calculation based on the
 * default rate set by Admin. The teller can unlock the Code field after
 * password verification — that override is logged for audit and applies only to
 * the in-progress transaction.
 */
export function RateAwareAmountFields({
  kind,
  defaultRate,
  usdValue,
  zwgValue,
  amountSource,
  onUsdChange,
  onZwgChange,
  onAmountSourceChange,
  onCodeChange,
  reference,
  hideZwg = false,
  singleCurrencyOnly = false,
}: Props) {
  const [code, setCode] = useState<string>(String(defaultRate || ""));
  const [unlocked, setUnlocked] = useState(false);
  const [overridden, setOverridden] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [verifying, setVerifying] = useState(false);
  const verifyFn = useServerFn(verifyMyPassword);
  const logFn = useServerFn(logCodeOverride);

  // Sync code when default rate changes (e.g. admin updated) AND user hasn't overridden.
  useEffect(() => {
    if (!overridden) setCode(String(defaultRate || ""));
  }, [defaultRate, overridden]);

  const onCodeChangeRef = useRef(onCodeChange);
  useEffect(() => {
    onCodeChangeRef.current = onCodeChange;
  }, [onCodeChange]);
  useEffect(() => {
    onCodeChangeRef.current?.(Number(code) || 0, overridden);
  }, [code, overridden]);

  const recalcFromUsd = (usd: string) => {
    onAmountSourceChange?.(usd && Number(usd) > 0 ? "usd" : null);
    onUsdChange(usd);
    if (hideZwg || singleCurrencyOnly) {
      if (!usd) onZwgChange("");
      return;
    }
    const c = Number(code);
    if (usd && c > 0) onZwgChange((Number(usd) * c).toFixed(2));
    else if (!usd) onZwgChange("");
  };
  const recalcFromZwg = (zwg: string) => {
    onAmountSourceChange?.(zwg && Number(zwg) > 0 ? "zwg" : null);
    onZwgChange(zwg);
    if (singleCurrencyOnly) {
      if (!zwg) onUsdChange("");
      return;
    }
    const c = Number(code);
    if (zwg && c > 0) onUsdChange(String(Math.round(Number(zwg) / c)));
    else if (!zwg) onUsdChange("");
  };

  // Re-derive the calculated amount when code itself changes.
  useEffect(() => {
    if (hideZwg || singleCurrencyOnly) return;
    const c = Number(code);
    if (amountSource === "zwg" && zwgValue && c > 0) onUsdChange(String(Math.round(Number(zwgValue) / c)));
    else if (usdValue && c > 0) onZwgChange((Number(usdValue) * c).toFixed(2));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  const handleVerify = async () => {
    if (!password) return toast.error("Enter your password");
    setVerifying(true);
    try {
      const res = await verifyFn({ data: { password } });
      if (!res.ok) {
        toast.error("Incorrect password");
        return;
      }
      setUnlocked(true);
      setDialogOpen(false);
      setPassword("");
      toast.success("Code unlocked for this transaction");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeBlur = async () => {
    if (!unlocked) return;
    const edited = Number(code);
    if (!edited || edited === defaultRate) return;
    if (overridden) return; // log once
    setOverridden(true);
    try {
      await logFn({
        data: {
          transaction_type: kind,
          original_rate: defaultRate,
          edited_rate: edited,
          reference: reference ?? null,
        },
      });
    } catch (e) {
      console.error("Failed to log code override", e);
    }
  };

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="code">Code (Rate)</Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              id="code"
              type="number"
              step="0.0001"
              min="0"
              value={code}
              readOnly={!unlocked}
              onChange={(e) => setCode(e.target.value)}
              onBlur={handleCodeBlur}
              className={!unlocked ? "bg-muted pr-9" : "pr-9"}
            />
            {!unlocked && (
              <Lock className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            )}
          </div>
          {!unlocked && (
            <Button type="button" variant="outline" onClick={() => setDialogOpen(true)}>
              <Pencil className="mr-1 h-3 w-3" /> Edit Code
            </Button>
          )}
        </div>
        {overridden && (
          <p className="text-xs text-amber-600">
            Code overridden (default {defaultRate}). This change is logged.
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="usd_amount">USD Amount</Label>
        <Input
          id="usd_amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={usdValue}
          onChange={(e) => recalcFromUsd(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="zwg_amount">ZWG Amount</Label>
        <Input
          id="zwg_amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min="0"
          value={zwgValue}
          onChange={(e) => recalcFromZwg(e.target.value)}
        />
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm password to edit code</DialogTitle>
            <DialogDescription>
              Enter your account password. The override applies only to this
              transaction and is recorded in the audit log.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="pw">Password</Label>
            <Input
              id="pw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleVerify} disabled={verifying}>
              {verifying ? "Verifying..." : "Unlock"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Hook to fetch the current Admin-set rate from the public table. */
export function useCurrencyRates() {
  const [rates, setRates] = useState<{ payments_rate: number; withdrawals_rate: number } | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase
        .from("currency_rates")
        .select("payments_rate, withdrawals_rate")
        .eq("key", "global")
        .maybeSingle();
      if (active && data) {
        setRates({
          payments_rate: Number(data.payments_rate) || 0,
          withdrawals_rate: Number(data.withdrawals_rate) || 0,
        });
      }
    })();
    return () => {
      active = false;
    };
  }, []);
  return rates;
}
