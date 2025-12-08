import { useDeriv } from "@/contexts/DerivContext";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Check } from "lucide-react";

export default function AccountSwitcher() {
  const { accountInfo, accounts, accountType, switchAccount } = useDeriv();

  if (!accountInfo || accounts.length === 0) {
    return null;
  }

  const currentLoginId = accountInfo.loginid;

  // Group accounts by type
  const demoAccounts = accounts.filter((acc) => acc.loginid.startsWith("VRT"));
  const realAccounts = accounts.filter((acc) => !acc.loginid.startsWith("VRT"));

  const handleAccountSwitch = async (loginid: string) => {
    if (loginid === currentLoginId) return;

    try {
      await switchAccount(loginid);
    } catch (error) {
      console.error("Failed to switch account:", error);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-2">
          <div className="flex items-center gap-2">
            <Badge
              variant={accountType === "demo" ? "secondary" : "default"}
              className={accountType === "demo" ? "bg-blue-500" : "bg-green-500"}
            >
              {accountType === "demo" ? "Demo" : "Real"}
            </Badge>
            <span className="text-sm font-medium">{currentLoginId}</span>
          </div>
          <ChevronDown className="w-4 h-4 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64 bg-popover border-border">
        {demoAccounts.length > 0 && (
          <>
            <DropdownMenuLabel className="text-muted-foreground">Demo Accounts</DropdownMenuLabel>
            {demoAccounts.map((account) => (
              <DropdownMenuItem
                key={account.loginid}
                onClick={() => handleAccountSwitch(account.loginid)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{account.loginid}</span>
                    <span className="text-xs text-muted-foreground">
                      {account.currency} {account.balance?.toFixed(2)}
                    </span>
                  </div>
                  {account.loginid === currentLoginId && (
                    <Check className="w-4 h-4 text-accent" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {realAccounts.length > 0 && (
          <>
            {demoAccounts.length > 0 && <DropdownMenuSeparator className="bg-border" />}
            <DropdownMenuLabel className="text-muted-foreground">Real Accounts</DropdownMenuLabel>
            {realAccounts.map((account) => (
              <DropdownMenuItem
                key={account.loginid}
                onClick={() => handleAccountSwitch(account.loginid)}
                className="cursor-pointer"
              >
                <div className="flex items-center justify-between w-full">
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{account.loginid}</span>
                    <span className="text-xs text-muted-foreground">
                      {account.currency} {account.balance?.toFixed(2)}
                    </span>
                  </div>
                  {account.loginid === currentLoginId && (
                    <Check className="w-4 h-4 text-accent" />
                  )}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
