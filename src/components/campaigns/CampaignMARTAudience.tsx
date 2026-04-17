import { AlertCircle } from "lucide-react";
import type { Campaign } from "@/hooks/useCampaigns";
import { CampaignAccountsContacts } from "./CampaignAccountsContacts";

interface Props {
  campaign: Campaign;
  selectedRegions: string[];
  campaignName?: string;
  campaignOwner?: string | null;
  endDate?: string | null;
  isCampaignEnded: boolean;
}

export function CampaignMARTAudience({ campaign, selectedRegions, campaignName, campaignOwner, endDate, isCampaignEnded }: Props) {
  return (
    <div className="space-y-3">
      {selectedRegions.length === 0 && (
        <div className="flex items-start gap-2 p-3 rounded-lg border border-yellow-500/20 bg-yellow-500/5 text-xs">
          <AlertCircle className="h-4 w-4 text-yellow-600 shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-yellow-700 dark:text-yellow-400">No regions selected</p>
            <p className="text-muted-foreground mt-0.5">
              Select regions in step 1 first. Without region filtering, the Add modals show every account/contact.
            </p>
          </div>
        </div>
      )}

      {selectedRegions.length > 0 && (
        <div className="text-xs text-muted-foreground px-1">
          Showing accounts and contacts filtered by: <span className="font-medium text-foreground">{selectedRegions.join(", ")}</span>
        </div>
      )}

      <CampaignAccountsContacts
        campaignId={campaign.id}
        isCampaignEnded={isCampaignEnded}
        campaignName={campaignName}
        campaignOwner={campaignOwner}
        endDate={endDate}
        compact
        selectedRegions={selectedRegions}
      />
    </div>
  );
}
