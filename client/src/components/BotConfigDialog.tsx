import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface BotConfig {
  market: string;
  stake: number;
  duration: number;
  contractType: 'CALL' | 'PUT' | 'CALLE' | 'PUTE';
  stopLoss?: number;
  takeProfit?: number;
}

interface BotConfigDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (config: BotConfig) => void;
  initialConfig?: BotConfig;
}

const MARKETS = [
  { value: "R_10", label: "Volatility 10 Index" },
  { value: "R_25", label: "Volatility 25 Index" },
  { value: "R_50", label: "Volatility 50 Index" },
  { value: "R_75", label: "Volatility 75 Index" },
  { value: "R_100", label: "Volatility 100 Index" },
  { value: "1HZ10V", label: "Volatility 10 (1s) Index" },
  { value: "1HZ25V", label: "Volatility 25 (1s) Index" },
  { value: "1HZ50V", label: "Volatility 50 (1s) Index" },
  { value: "1HZ75V", label: "Volatility 75 (1s) Index" },
  { value: "1HZ100V", label: "Volatility 100 (1s) Index" },
  { value: "BOOM500", label: "Boom 500 Index" },
  { value: "BOOM1000", label: "Boom 1000 Index" },
  { value: "CRASH500", label: "Crash 500 Index" },
  { value: "CRASH1000", label: "Crash 1000 Index" },
];

const CONTRACT_TYPES = [
  { value: "CALL", label: "Rise" },
  { value: "PUT", label: "Fall" },
  { value: "CALLE", label: "Higher" },
  { value: "PUTE", label: "Lower" },
];

export default function BotConfigDialog({
  open,
  onOpenChange,
  onSave,
  initialConfig,
}: BotConfigDialogProps) {
  const [config, setConfig] = useState<BotConfig>(
    initialConfig || {
      market: "R_100",
      stake: 1,
      duration: 5,
      contractType: "CALL",
      stopLoss: 0,
      takeProfit: 0,
    }
  );

  const handleSave = () => {
    onSave(config);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-gray-800 text-white border-gray-700">
        <DialogHeader>
          <DialogTitle>Bot Configuration</DialogTitle>
          <DialogDescription className="text-gray-400">
            Configure your trading bot parameters before running
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Market Selection */}
          <div className="space-y-2">
            <Label htmlFor="market">Market</Label>
            <Select
              value={config.market}
              onValueChange={(value) =>
                setConfig({ ...config, market: value })
              }
            >
              <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                <SelectValue placeholder="Select market" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600 text-white">
                {MARKETS.map((market) => (
                  <SelectItem key={market.value} value={market.value}>
                    {market.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Contract Type */}
          <div className="space-y-2">
            <Label htmlFor="contractType">Contract Type</Label>
            <Select
              value={config.contractType}
              onValueChange={(value: any) =>
                setConfig({ ...config, contractType: value })
              }
            >
              <SelectTrigger className="bg-gray-700 border-gray-600 text-white">
                <SelectValue placeholder="Select contract type" />
              </SelectTrigger>
              <SelectContent className="bg-gray-700 border-gray-600 text-white">
                {CONTRACT_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Stake Amount */}
          <div className="space-y-2">
            <Label htmlFor="stake">Stake Amount (USD)</Label>
            <Input
              id="stake"
              type="number"
              min="0.35"
              step="0.01"
              value={config.stake}
              onChange={(e) =>
                setConfig({ ...config, stake: parseFloat(e.target.value) })
              }
              className="bg-gray-700 border-gray-600 text-white"
            />
            <p className="text-xs text-gray-400">Minimum: $0.35</p>
          </div>

          {/* Duration */}
          <div className="space-y-2">
            <Label htmlFor="duration">Duration (ticks)</Label>
            <Input
              id="duration"
              type="number"
              min="1"
              max="10"
              value={config.duration}
              onChange={(e) =>
                setConfig({ ...config, duration: parseInt(e.target.value) })
              }
              className="bg-gray-700 border-gray-600 text-white"
            />
            <p className="text-xs text-gray-400">1-10 ticks</p>
          </div>

          {/* Risk Management */}
          <div className="space-y-2">
            <Label>Risk Management</Label>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="stopLoss" className="text-xs text-gray-400">Stop Loss ($)</Label>
                <Input
                  id="stopLoss"
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.stopLoss || 0}
                  onChange={(e) =>
                    setConfig({ ...config, stopLoss: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-gray-700 border-gray-600 text-white"
                  placeholder="0.00"
                />
              </div>
              <div>
                <Label htmlFor="takeProfit" className="text-xs text-gray-400">Take Profit ($)</Label>
                <Input
                  id="takeProfit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={config.takeProfit || 0}
                  onChange={(e) =>
                    setConfig({ ...config, takeProfit: parseFloat(e.target.value) || 0 })
                  }
                  className="bg-gray-700 border-gray-600 text-white"
                  placeholder="0.00"
                />
              </div>
            </div>
            <p className="text-xs text-gray-400">
              Bot will automatically stop when profit/loss reaches these limits (0 = disabled)
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="bg-gray-700 text-white border-gray-600"
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Configuration
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
