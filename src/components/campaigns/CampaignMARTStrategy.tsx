import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CheckCircle2, Circle, ChevronDown, ChevronRight, ChevronsUpDown, Mail, Users, Globe, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { CampaignMARTMessage } from "./CampaignMARTMessage";
import { CampaignMARTAudience } from "./CampaignMARTAudience";
import { CampaignMARTRegion } from "./CampaignMARTRegion";
import { CampaignMARTTiming } from "./CampaignMARTTiming";
import type { Campaign } from "@/hooks/useCampaigns";

interface Props {
  campaignId: string;
  campaign: Campaign;
  isMARTComplete: { message: boolean; audience: boolean; region: boolean; timing: boolean };
  updateMartFlag: (flag: string, value: boolean) => Promise<void>;
  isCampaignEnded: boolean;
  daysRemaining: number | null;
  timingNotes?: string | null;
  campaignName?: string;
  campaignOwner?: string | null;
  endDate?: string | null;
  contentCounts?: {
    emailTemplateCount: number;
    phoneScriptCount: number;
    linkedinTemplateCount: number;
    materialCount: number;
    regionCount: number;
    accountCount: number;
    contactCount: number;
  };
}

export function parseSelectedRegions(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) {
      return Array.from(new Set(arr.map((r: any) => r.region).filter(Boolean)));
    }
  } catch {}
  return raw && !raw.startsWith("[") ? [raw] : [];
}

export function CampaignMARTStrategy({ campaignId, campaign, isMARTComplete, updateMartFlag, isCampaignEnded, daysRemaining, timingNotes, campaignName, campaignOwner, endDate, contentCounts }: Props) {
  const queryClient = useQueryClient();
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    region: true, audience: false, message: false, timing: false,
  });

  const selectedRegions = useMemo(() => parseSelectedRegions(campaign.region), [campaign.region]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const toggleAll = () => {
    const allOpen = Object.values(openSections).every(Boolean);
    const newState = { region: !allOpen, audience: !allOpen, message: !allOpen, timing: !allOpen };
    setOpenSections(newState);
  };

  const validateSection = (key: string): string | null => {
    const counts = contentCounts;
    switch (key) {
      case "region":
        if ((counts?.regionCount ?? 0) === 0)
          return "Add at least 1 region before marking Region as done.";
        return null;
      case "audience":
        if ((counts?.accountCount ?? 0) === 0 && (counts?.contactCount ?? 0) === 0)
          return "Add at least 1 account or contact before marking Audience as done.";
        return null;
      case "message":
        if (counts && counts.emailTemplateCount === 0 && counts.phoneScriptCount === 0 && counts.linkedinTemplateCount === 0)
          return "Add at least 1 email template, call script, or LinkedIn message before marking Message as done.";
        return null;
      case "timing":
        if (!campaign.start_date || !campaign.end_date)
          return "Set campaign start and end dates before marking Timing as done.";
        return null;
      default:
        return null;
    }
  };

  const handleMarkDone = async (flag: string, label: string, key: string) => {
    const validationError = validateSection(key);
    if (validationError) {
      toast.warning(validationError);
      return;
    }
    await updateMartFlag(flag, true);
    toast.success(`${label} marked as done`);
  };

  const handleUnmark = async (flag: string, label: string) => {
    await updateMartFlag(flag, false);
    toast.info(`${label} unmarked`);
  };

  const handleSaveTimingNotes = async (notes: string) => {
    if (!campaignId) return;
    const { data: existing } = await supabase.from("campaign_mart").select("campaign_id").eq("campaign_id", campaignId).maybeSingle();
    if (existing) {
      await supabase.from("campaign_mart").update({ timing_notes: notes }).eq("campaign_id", campaignId);
    } else {
      await supabase.from("campaign_mart").insert({ campaign_id: campaignId, timing_notes: notes });
    }
    queryClient.invalidateQueries({ queryKey: ["campaign-mart", campaignId] });
    toast.success("Timing note saved");
  };

  const completedCount = [isMARTComplete.region, isMARTComplete.audience, isMARTComplete.message, isMARTComplete.timing].filter(Boolean).length;
  const progressPercent = (completedCount / 4) * 100;

  const getContentSummary = (key: string): string => {
    if (!contentCounts) return "";
    switch (key) {
      case "region":
        return contentCounts.regionCount > 0 ? `${contentCounts.regionCount} region${contentCounts.regionCount > 1 ? "s" : ""}` : "No regions";
      case "audience":
        return `${contentCounts.accountCount} accounts · ${contentCounts.contactCount} contacts`;
      case "message": {
        const parts: string[] = [];
        if (contentCounts.emailTemplateCount > 0) parts.push(`${contentCounts.emailTemplateCount} email${contentCounts.emailTemplateCount > 1 ? "s" : ""}`);
        if (contentCounts.phoneScriptCount > 0) parts.push(`${contentCounts.phoneScriptCount} script${contentCounts.phoneScriptCount > 1 ? "s" : ""}`);
        if (contentCounts.linkedinTemplateCount > 0) parts.push(`${contentCounts.linkedinTemplateCount} LinkedIn`);
        return parts.join(", ");
      }
      case "timing":
        return campaign.start_date && campaign.end_date ? `${campaign.start_date} → ${campaign.end_date}` : "Dates not set";
      default:
        return "";
    }
  };

  const sectionIcons: Record<string, React.ReactNode> = {
    region: <Globe className="h-4 w-4" />,
    audience: <Users className="h-4 w-4" />,
    message: <Mail className="h-4 w-4" />,
    timing: <Clock className="h-4 w-4" />,
  };

  // Order: Region → Audience → Message → Timing
  const sections = [
    { key: "region", label: "Region", flag: "region_done", done: isMARTComplete.region },
    { key: "audience", label: "Audience", flag: "audience_done", done: isMARTComplete.audience },
    { key: "message", label: "Message", flag: "message_done", done: isMARTComplete.message },
    { key: "timing", label: "Timing", flag: "timing_done", done: isMARTComplete.timing },
  ];

  return (
    <div className="space-y-3">
      {/* Overall MART Progress */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 shrink-0">
              <h3 className="font-semibold text-sm">MART</h3>
              <Badge variant={completedCount === 4 ? "default" : "secondary"} className="text-xs">
                {completedCount}/4
              </Badge>
            </div>
            <Progress value={progressPercent} className="h-2 flex-1" />
            <div className="flex items-center gap-2 shrink-0">
              {sections.map((s) => (
                <div key={s.key} className="flex items-center gap-1 text-xs text-muted-foreground">
                  {s.done ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <Circle className="h-3 w-3" />}
                  <span className="hidden sm:inline">{s.label}</span>
                </div>
              ))}
            </div>
            <Button variant="ghost" size="sm" className="text-xs gap-1 h-7 shrink-0" onClick={toggleAll}>
              <ChevronsUpDown className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{Object.values(openSections).every(Boolean) ? "Collapse" : "Expand"}</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {sections.map((section) => (
        <Card key={section.key} className={`border-l-4 ${section.done ? "border-l-green-500" : "border-l-muted-foreground/30"}`}>
          <Collapsible open={openSections[section.key]} onOpenChange={() => toggleSection(section.key)}>
            <CollapsibleTrigger asChild>
              <CardHeader className="py-2.5 px-4 cursor-pointer hover:bg-muted/30 transition-colors">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {openSections[section.key] ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
                    {section.done ? <CheckCircle2 className="h-4 w-4 text-primary shrink-0" /> : <Circle className="h-4 w-4 text-muted-foreground shrink-0" />}
                    {sectionIcons[section.key]}
                    <CardTitle className="text-sm">{section.label}</CardTitle>
                    {section.done && <Badge variant="secondary" className="bg-primary/10 text-primary text-[10px] px-1.5 py-0">Done</Badge>}
                    {(() => {
                      const summary = getContentSummary(section.key);
                      return summary ? (
                        <span className="text-xs text-muted-foreground ml-1 truncate">· {summary}</span>
                      ) : null;
                    })()}
                  </div>
                  <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                    {section.done ? (
                      <Button variant="ghost" size="sm" className="text-xs h-7" onClick={() => handleUnmark(section.flag, section.label)}>Unmark</Button>
                    ) : (
                      <Button size="sm" className="text-xs h-7" onClick={() => handleMarkDone(section.flag, section.label, section.key)}>Mark Done</Button>
                    )}
                  </div>
                </div>
              </CardHeader>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <CardContent className="pt-0 px-4 pb-4">
                {section.key === "region" && <CampaignMARTRegion campaign={campaign} />}
                {section.key === "audience" && (
                  <CampaignMARTAudience
                    campaign={campaign}
                    selectedRegions={selectedRegions}
                    campaignName={campaignName}
                    campaignOwner={campaignOwner}
                    endDate={endDate}
                    isCampaignEnded={isCampaignEnded}
                  />
                )}
                {section.key === "message" && (
                  <CampaignMARTMessage
                    campaignId={campaignId}
                    campaign={campaign}
                    selectedRegions={selectedRegions}
                    audienceCounts={{ accounts: contentCounts?.accountCount ?? 0, contacts: contentCounts?.contactCount ?? 0 }}
                  />
                )}
                {section.key === "timing" && (
                  <CampaignMARTTiming
                    campaign={campaign}
                    isCampaignEnded={isCampaignEnded}
                    daysRemaining={daysRemaining}
                    timingNotes={timingNotes}
                    onSaveTimingNotes={handleSaveTimingNotes}
                  />
                )}
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      ))}
    </div>
  );
}
