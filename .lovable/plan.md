

# MART Workflow Restructure — Region → Audience → Message → Timing

## New Order

```text
1. Region    →  2. Audience    →  3. Message      →  4. Timing
   (geography)   (filtered by      (AI uses region    (when to
                  region picks)     + audience ctx)    execute)
```

Region first defines geography. Audience picks accounts/contacts within those regions. Message generates AI templates using both as context. Timing schedules execution.

## Tab Restructure (CampaignDetail)

6 tabs → **5 tabs**: Overview · MART Strategy · Outreach · Tasks · Analytics
- "Accounts & Contacts" tab merged into MART → Audience
- "Materials" merged into Outreach tab

## Section Changes

### 1. Region (first)
- Multi-region cards (existing UI from `CampaignMARTRegion.tsx`).
- Remove `messaging_note` field (unused).
- Add live counter footer: **"X accounts and Y contacts available in selected regions"**.
- Mark Done requires ≥1 region.

### 2. Audience (second)
- **Drop** persona JSON form (`job_titles`, `departments`, etc.) from rendering. DB column preserved.
- **Embed** `CampaignAccountsContacts` in compact mode, pre-filtered by `selectedRegions` from step 1.
- "Add Accounts" / "Add Contacts" modals scope queries to selected regions only.
- New bulk filter chips in Add modals: **Position** (multi-select), **Industry** (multi-select), "Select all filtered".
- If no regions selected → inline warning "Select regions in step 1 first" + fallback to all regions.
- Mark Done requires ≥1 account OR ≥1 contact linked.

### 3. Message (third)
- Add **"Generate with AI"** button on Email, LinkedIn, and Phone Script create/edit modals.
- AI prompt context: campaign name, type, goal, **selected regions + linked audience** (now available since steps 1 & 2 ran first).
- New edge function `generate-campaign-template` using Lovable AI Gateway (`google/gemini-3-flash-preview`) with tool-calling for structured JSON (subject/body for email; body for LinkedIn; opening/talking_points/objections for phone).
- Materials block removed from this section.

### 4. Timing (last)
- Keep existing date inputs.
- Export `isWithinActiveWindow(campaign)` helper from `CampaignMARTTiming`.
- Outreach actions (Send Email / Log Call / LinkedIn) blocked outside campaign date range with toast.
- Active-window banner on Outreach tab.
- Mark Done requires start_date + end_date with end_date ≥ today.

## Cross-Section Wiring

| User action | System reaction |
|---|---|
| Picks regions in step 1 | Cached on campaign; Audience auto-refilters |
| Opens Add Accounts (step 2) | Query: `accounts.region IN (selectedRegions)` |
| Opens Add Contacts (step 2) | Filter via linked account region |
| Clears all regions | Audience shows warning, falls back to all |
| Generates AI template (step 3) | Prompt includes regions + linked accounts/contacts summary |

## Files to Modify

| File | Change |
|---|---|
| `src/pages/CampaignDetail.tsx` | Drop Accounts/Contacts tab, reduce to 5 tabs |
| `src/components/campaigns/CampaignMARTStrategy.tsx` | Reorder sections (region → audience → message → timing); update validation; pass region/audience counts down |
| `src/components/campaigns/CampaignMARTRegion.tsx` | Remove `messaging_note`; add live account/contact count footer |
| `src/components/campaigns/CampaignMARTAudience.tsx` | Replace persona form with `<CampaignAccountsContacts compact selectedRegions={...} />` |
| `src/components/campaigns/CampaignAccountsContacts.tsx` | Add `compact` + `selectedRegions` props; pre-filter queries; add Position/Industry filter chips in Add modals |
| `src/components/campaigns/CampaignMARTMessage.tsx` | Add "Generate with AI" buttons on each template type modal; remove materials block |
| `src/components/campaigns/CampaignMARTTiming.tsx` | Export `isWithinActiveWindow(campaign)` helper |
| `src/components/campaigns/CampaignCommunications.tsx` | Block outreach outside dates; active-window banner; small materials list |
| **NEW** `supabase/functions/generate-campaign-template/index.ts` | Lovable AI Gateway call w/ tool-calling for structured templates |
| `supabase/config.toml` | Register `generate-campaign-template` |

## Technical Notes

- **AI**: `LOVABLE_API_KEY` already configured. Default model `google/gemini-3-flash-preview`. Tool-calling enforces JSON schema per template type.
- **Region source**: existing `src/utils/countryRegionMapping.ts`.
- **Backward compat**: existing `target_audience` JSON preserved in DB; UI no longer renders or requires it. Audience "Mark Done" reads `campaign_accounts` / `campaign_contacts` counts (already cached).
- **Performance**: live counts use cached campaign-detail query; Add modals filter server-side via `.in('region', selectedRegions)`.
- **No DB migration required** — uses existing tables and columns.

