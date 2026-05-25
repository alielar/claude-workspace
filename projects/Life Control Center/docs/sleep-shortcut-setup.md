# CC Sleep Sync — Apple Shortcut Setup

This guide walks you through setting up an Apple Shortcut that automatically sends your sleep data from Apple Health to your Life Control Center dashboard every morning.

## What you need

- An iPhone with **Apple Shortcuts** (built-in, free — comes with iOS)
- An Apple Watch or sleep-tracking app that writes data to Apple Health
- Your Control Center running at: `https://life-control-center-eta.vercel.app`

## Step 1: Create the Shortcut

1. Open the **Shortcuts** app on your iPhone
2. Tap the **+** button (top right) to create a new shortcut
3. Tap the name at the top and rename it to **"CC Sleep Sync"**

## Step 2: Add the actions

Add these actions in order. To add an action, tap **"Add Action"** or the search bar at the bottom and search for the action name.

### Action 1 — Get last night's sleep data

- Search for **"Find Health Samples"**
- Set Type to: **Sleep Analysis**
- Sort by: **Start Date**, **Latest First**
- Limit: **1**

### Action 2 — Get heart rate during sleep

- Add another **"Find Health Samples"**
- Set Type to: **Heart Rate**
- Set Start Date filter: **is in the last 1 day**
- This will grab heart rate samples from roughly last night

### Action 3 — Get respiratory rate

- Add another **"Find Health Samples"**
- Set Type to: **Respiratory Rate**
- Set Start Date filter: **is in the last 1 day**

### Action 4 — Get blood oxygen

- Add another **"Find Health Samples"**
- Set Type to: **Blood Oxygen**
- Set Start Date filter: **is in the last 1 day**

### Action 5 — Send the data to Control Center

- Search for **"Get Contents of URL"**
- Set URL to:
  ```
  https://life-control-center-eta.vercel.app/api/sleep/ingest
  ```
- Set Method to: **POST**
- Set Request Body to: **JSON**
- Add these fields (tap "Add new field" for each):

| Key | Type | Value |
|-----|------|-------|
| `date` | Text | Today's date in YYYY-MM-DD format (use "Format Date" action on Current Date if needed) |
| `bedtime` | Text | Start time from Sleep Analysis result (format as HH:mm) |
| `wake_time` | Text | End time from Sleep Analysis result (format as HH:mm) |
| `duration_minutes` | Number | Duration from Sleep Analysis result (in minutes) |
| `heart_rate_avg` | Number | Average of Heart Rate results |
| `heart_rate_min` | Number | Minimum of Heart Rate results |
| `heart_rate_max` | Number | Maximum of Heart Rate results |
| `respiratory_rate_avg` | Number | Average of Respiratory Rate results |
| `blood_oxygen_avg` | Number | Average of Blood Oxygen results |

> **Tip:** For sleep stages (deep, core, REM, awake), Apple Health exposes these as separate Sleep Analysis categories. If your watch tracks them, you can add additional "Find Health Samples" actions filtered by each stage type and include `stage_deep_minutes`, `stage_core_minutes`, `stage_rem_minutes`, and `stage_awake_minutes` in the JSON body.

### Action 6 (Optional) — Show confirmation

- Search for **"Show Notification"**
- Set title to: **Sleep synced to Control Center**
- Set body to: whatever you like, e.g. the date

## Step 3: Set up daily automation

1. Open the **Shortcuts** app
2. Go to the **Automation** tab (bottom bar)
3. Tap **+ New Automation**
4. Choose **Time of Day**
5. Set time to **10:00 AM**
6. Set repeat to **Daily**
7. Choose **"Run Immediately"** (so it doesn't ask you each time)
8. Search for and select your **"CC Sleep Sync"** shortcut

## Troubleshooting

- **Shortcut doesn't run automatically?** Open Settings > Shortcuts > Advanced and make sure "Allow Running Scripts" is turned on. Also check that your automation is set to "Run Immediately" not "Ask Before Running."
- **No data showing up?** Open the Shortcuts app and tap the shortcut manually to run it. Check if you see a notification. If it errors, make sure the URL is correct and your Control Center is deployed.
- **Missing sleep stages?** Not all devices track sleep stages. If your Apple Watch doesn't record deep/core/REM/awake stages, those fields will simply be empty — the dashboard handles this gracefully and just won't show the stages bar.
- **Heart rate shows nothing?** Make sure your Apple Watch was worn during sleep and that Health permissions allow Shortcuts to read heart rate data. Go to Settings > Health > Data Access & Devices > Shortcuts and enable all categories.
