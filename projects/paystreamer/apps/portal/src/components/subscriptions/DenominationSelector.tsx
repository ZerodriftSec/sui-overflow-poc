import {  PUSD_TYPE_ARG  } from "@paystreamer/sdk";
import { cn } from "../../lib/utils";
import { Badge } from "@paystreamer/sdk";
import { Card, CardContent } from "@paystreamer/sdk";

type Denomination = {
  type: string;
  name: string;
  symbol: string;
  isStable: boolean;
};

interface DenominationSelectorProps {
  selected: string | null;
  onSelect: (type: string) => void;
}

const USD_DENOMINATION: Denomination = {
  type: PUSD_TYPE_ARG,
  name: "US Dollar",
  symbol: "USD",
  isStable: true,
};

export function DenominationSelector({ selected, onSelect }: DenominationSelectorProps) {
  const availableDenominations: Denomination[] = [USD_DENOMINATION];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {availableDenominations.map((denom) => {
        const isSelected = selected === denom.type;
        return (
          <Card
            key={denom.type}
            className={cn(
              "cursor-pointer transition-all hover:border-primary/50",
              isSelected && "border-primary bg-primary/5"
            )}
            onClick={() => onSelect(denom.type)}
          >
            <CardContent className="flex flex-col items-center gap-3 py-6">
              <div className="text-3xl font-bold">{denom.symbol}</div>
              <div className="text-sm text-muted-foreground">{denom.name}</div>
              <Badge variant={denom.isStable ? "secondary" : "default"}>
                {denom.isStable ? "Stable" : "Volatile"}
              </Badge>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
