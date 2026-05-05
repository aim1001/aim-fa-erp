import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";

const STORAGE_KEY = "finance_auth_v1";
const CORRECT_PIN = "6937";

export function FinanceGuard({ children }: { children: React.ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STORAGE_KEY) === "true") {
      setAuthenticated(true);
    }
  }, []);

  const submit = () => {
    if (pin === CORRECT_PIN) {
      sessionStorage.setItem(STORAGE_KEY, "true");
      setAuthenticated(true);
      setError(false);
    } else {
      setError(true);
      setPin("");
    }
  };

  if (authenticated) return <>{children}</>;

  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-full max-w-xs space-y-4 p-6 border rounded-xl shadow-sm bg-card">
        <div className="flex flex-col items-center gap-2 text-center">
          <div className="bg-muted rounded-full p-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <h2 className="text-base font-semibold">경영지원</h2>
          <p className="text-xs text-muted-foreground">접근하려면 비밀번호를 입력하세요</p>
        </div>
        <Input
          type="password"
          placeholder="비밀번호"
          value={pin}
          autoFocus
          onChange={e => { setPin(e.target.value); setError(false); }}
          onKeyDown={e => { if (e.key === "Enter") submit(); }}
          className={error ? "border-destructive focus-visible:ring-destructive" : ""}
          data-testid="input-finance-pin"
        />
        {error && (
          <p className="text-xs text-destructive text-center" data-testid="text-finance-pin-error">
            비밀번호가 올바르지 않습니다
          </p>
        )}
        <Button className="w-full" onClick={submit} data-testid="button-finance-pin-confirm">
          확인
        </Button>
      </div>
    </div>
  );
}
