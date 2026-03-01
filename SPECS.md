# Drip4Life IV Scheduler — Product Specification & UI Mockups

## 1. Product Overview

**Application:** IV Scheduler
**Client:** Drip4Life IV Therapy
**Purpose:** Staff scheduling system for an IV therapy business with multiple branches
**Stack:** React 19 + Vite + Tailwind CSS 4 + Firebase Realtime Database
**Deployment:** Vercel
**Repository:** github.com/jacovanzyl04/iv-scheduler

### Problem Statement
Drip4Life operates 4 branches (3 retail + 1 clinic) with 14+ staff members across two roles (nurses and receptionists). Each staff member has unique constraints: day restrictions, branch preferences, priority status, work-alone capabilities, and minimum shift requirements. Manually scheduling is error-prone and time-consuming.

### Solution
A web-based scheduling tool that:
- Auto-generates weekly schedules respecting all staff constraints
- Allows manual drag-and-drop adjustments with real-time validation
- Supports split shifts (partial-day assignments with custom times)
- Syncs across devices via Firebase
- Exports formatted Excel schedules for printing/sharing
- Tracks monthly hours for permanent staff

---

## 2. Architecture

```
┌─────────────────────────────────────────────────────────┐
│                      Browser (SPA)                       │
│                                                          │
│  ┌──────────┐  ┌───────────────────┐  ┌──────────────┐  │
│  │ Sidebar  │  │   Active Page     │  │   Modals     │  │
│  │ (nav)    │  │ (5 views below)   │  │ (overlays)   │  │
│  └──────────┘  └───────────────────┘  └──────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐    │
│  │              App.jsx (State Manager)              │    │
│  │  schedule, staff, availability, shiftRequests     │    │
│  └──────────┬───────────────────────┬───────────────┘    │
│             │                       │                    │
│  ┌──────────▼──────┐    ┌──────────▼──────────────┐     │
│  │  localStorage   │    │  Firebase Realtime DB    │     │
│  │  (offline cache)│    │  (multi-device sync)     │     │
│  └─────────────────┘    └─────────────────────────┘     │
└─────────────────────────────────────────────────────────┘
```

### Tech Stack

| Layer         | Technology                        |
|---------------|-----------------------------------|
| Framework     | React 19.2                        |
| Build         | Vite 6.3                          |
| Styling       | Tailwind CSS 4.2 (@tailwindcss/vite) |
| Icons         | Lucide React 0.575                |
| Database      | Firebase Realtime Database 12.9   |
| Excel Export  | xlsx-js-style 1.2 + file-saver 2.0 |
| Date Utils    | date-fns 4.1                      |
| Hosting       | Vercel                            |

### Data Flow
1. App loads state from localStorage (instant)
2. Firebase listeners attach (if configured)
3. Firebase updates override local state (flagged to prevent write loops)
4. User changes write to both localStorage + Firebase simultaneously
5. `normalizeSchedules()` repairs Firebase's empty-array dropping behavior

---

## 3. Data Model

### 3.1 Branches

| Branch          | ID          | Type    | Mon-Fri    | Saturday   | Sunday     |
|-----------------|-------------|---------|------------|------------|------------|
| Parkview        | `parkview`  | Retail  | 09:00-18:00| 09:00-17:00| 10:00-16:00|
| Clearwater Mall | `clearwater`| Retail  | 08:00-18:00| 08:00-18:00| 08:00-18:00|
| Rosebank Mall   | `rosebank`  | Retail  | 08:00-18:00| 09:00-18:00| 09:00-17:00|
| Colon Clinic    | `clinic`    | Clinic  | 07:00-16:00| 08:00-13:00| **Closed** |

**Clinic special rules:**
- Nurse only (no receptionist needed)
- Lowest scheduling priority (fill last)
- Saturday: closes at 13:00 (nurse can split to main branch afternoon)

### 3.2 Staff Members

```
Staff {
  id:                 string       // Unique identifier (e.g., "dinah")
  name:               string       // Display name
  role:               "nurse" | "receptionist"
  employmentType:     "permanent" | "parttime" | "locum"
  branches:           string[]     // Branch IDs this person can work at
  lastResortBranches: string[]     // Only assign here if no other option
  mainBranch:         string?      // Preferred branch (gets priority)
  alsoMainBranch:     string?      // Secondary preferred branch
  availableDays:      string[]?    // null = all days, or specific days
  priority:           boolean      // Gets all requested shifts first
  canWorkAlone:       boolean      // Can cover branch without receptionist
  alsoManager:        boolean      // Can fill receptionist role
  minShiftsPerWeek:   number?      // Minimum required shifts
  monthlyHoursTarget: number?      // For permanent staff tracking
  weekendBothOrNone:  boolean      // Must have both Sat+Sun or neither
  color:              string       // Visual tag color name
  notes:              string       // Free-text notes
}
```

**14 Staff Members:**

| Name        | Role         | Type      | Branches              | Constraints                              |
|-------------|--------------|-----------|------------------------|------------------------------------------|
| Jaco        | Receptionist | Part-time | Parkview               | Fri-Sun only, also manager               |
| Ian         | Receptionist | Part-time | Parkview, Rosebank     | Min 4 shifts/week                        |
| Nothando    | Receptionist | Part-time | Clearwater, Rosebank   | Clearwater main                          |
| Yondi       | Receptionist | Permanent | All (Rosebank main)    | Hours target TBD                         |
| Thabang     | Receptionist | Part-time | All                    | Flexible                                 |
| Nomonde     | Receptionist | Part-time | PV, CW, RB            | Weekends only, both-or-none              |
| Nneka       | Nurse        | Part-time | Rosebank (CW last-resort)| Priority, Rosebank main               |
| Dr Jean     | Nurse        | Part-time | Parkview, Clearwater   | CW main, can work alone                  |
| Trinity     | Nurse        | Part-time | Parkview               | Weekends only, can work alone            |
| Sibusiso    | Nurse        | Part-time | Parkview, Clearwater   | Cannot work alone                        |
| Ringisani   | Nurse        | Part-time | Clearwater             | Clearwater only                          |
| Vuyelwa     | Nurse        | Part-time | Clearwater, Rosebank   | Cannot work alone                        |
| Samantha    | Nurse        | Part-time | Clearwater, Rosebank   | Cannot work alone                        |
| Lindokuhle  | Nurse        | Part-time | Clearwater, Rosebank   | Cannot work alone                        |
| Dinah       | Nurse        | Permanent | All (PV main, Clinic)  | Priority, hours target TBD               |
| Ntombi      | Nurse        | Permanent | All (PV main, Clinic)  | Priority, hours target TBD               |

### 3.3 Schedule Data Structure

```
schedules: {
  [weekKey: "YYYY-MM-DD"]: {        // Monday date of week
    [day: "Monday"|...]: {
      [branchId: string]: {
        nurses: Assignment[]
        receptionists: Assignment[]
      }
    }
  }
}

Assignment {
  id:         string     // Staff member ID
  name:       string     // Staff display name
  locked:     boolean    // Preserved during auto-schedule
  shiftStart: string?    // Optional "HH:MM" (partial shift)
  shiftEnd:   string?    // Optional "HH:MM" (partial shift)
}
```

### 3.4 Availability & Requests

```
availability: {
  [staffId]: string[]    // Array of "YYYY-MM-DD" dates marked as leave
}

shiftRequests: {
  [staffId]: {
    [day]: branchId      // Priority staff preferred branch per day
  }
}
```

---

## 4. Pages & UI Mockups

### 4.1 Sidebar Navigation

```
┌─────────────────────┐
│ 💧 IV Scheduler     │
│    Staff Management  │
│                   [<]│
├─────────────────────┤
│ ▣  Dashboard        │
│ 📅 Weekly Schedule  │  ← Active (teal highlight)
│ 👥 Staff            │
│ 📋 Availability     │
│ ⏱  Monthly Hours    │
├─────────────────────┤
│                     │
│ Drip4Life IV Therapy│
└─────────────────────┘
```

- Collapsible (icons-only mode at 64px → 16px)
- Gradient background: teal-700 → teal-900
- Active page: teal-600 with shadow

---

### 4.2 Dashboard

```
┌─────────────────────────────────────────────────────────────────┐
│  Dashboard                            < [Today] 23 Feb-01 Mar >│
│  Week overview at a glance                                      │
│                                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ Coverage  │ │ Active   │ │ Total    │ │ Issues   │           │
│  │  100%     │ │ Staff 10 │ │ Shifts 43│ │    1     │           │
│  │  (green)  │ │          │ │          │ │  (amber) │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  ┌──────────────────────────────────────────────────────┐       │
│  │ Schedule Issues                                       │       │
│  │ ⚠ Ian has only 2 shifts this week (minimum 4 required)│      │
│  └──────────────────────────────────────────────────────┘       │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ Parkview             │  │ Clearwater Mall      │              │
│  │ Mon  Tue  Wed ...    │  │ Mon  Tue  Wed ...    │              │
│  │ Dinah Dinah Dinah    │  │ Ntombi Ntombi Ntombi │              │
│  │ Yondi Yondi Yondi    │  │ Nothando Nothando   │              │
│  └─────────────────────┘  └─────────────────────┘              │
│                                                                  │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │ Rosebank Mall        │  │ Colon Clinic         │              │
│  │ Mon  Tue  Wed ...    │  │ Mon  Tue  Wed ...    │              │
│  │ Nneka Nneka Nneka    │  │ No    No   No        │              │
│  │ Ian  Thabang Ian     │  │ nurse nurse nurse     │              │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

**Metric Cards:**
- Coverage %: green (100%), amber (80-99%), red (<80%)
- Issues: red (errors), amber (warnings)

**Branch Grids:**
- Compact Mon-Sun layout per branch
- Red cells = missing nurse, Pink = missing receptionist

---

### 4.3 Weekly Schedule (Main View)

```
┌─────────────────────────────────────────────────────────────────────────┐
│  Weekly Schedule                           < [Today] 23 Feb-01 Mar >   │
│  Drag staff between cells or click + to assign                          │
│                                                                          │
│  [✨ Auto Schedule] [🗑 Clear] [📥 Export Excel] [⚠ 1 Issues]          │
│                                                                          │
│  Branch          Mon 23  Tue 24  Wed 25  Thu 26  Fri 27  Sat 28  Sun 1 │
│  ─────────────── ─────── ─────── ─────── ─────── ─────── ─────── ──────│
│  Parkview       │🩺Dinah│🩺Dinah│🩺Dinah│🩺Dinah│🩺Dinah│🩺Ntombi│🩺Dinah│
│  Nurse          │  🔒   │  🔒   │  🔒   │  🔒   │  🔒   │(9-13) │      │
│                 │       │       │       │       │       │🩺Dinah│      │
│                 │       │       │       │       │       │(13-17)│      │
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│  Receptionist   │🎧Yondi│🎧Yondi│🎧Yondi│🎧Yondi│🎧Jaco │🎧Jaco │🎧Jaco│
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│  Clearwater Mall│🩺Ntom │🩺Ntom │🩺Ntom │🩺Ntom │🩺Ntom │🩺DrJ  │🩺Ntom│
│  Nurse          │       │       │       │       │       │       │      │
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│  Receptionist   │🎧Noth │🎧Noth │🎧Noth │🎧Noth │🎧Noth │🎧Nomo │🎧Nomo│
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│  Rosebank Mall  │🩺Nneka│🩺Nneka│🩺Nneka│🩺Nneka│🩺Nneka│       │🩺Nneka│
│  Nurse          │       │       │       │       │       │       │      │
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│  Receptionist   │🎧Ian  │🎧Thab │🎧Ian  │🎧Thab │🎧Yondi│🎧Yondi│🎧Yondi│
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│  Colon Clinic   │+Assign│+Assign│+Assign│+Assign│+Assign│🩺Dinah│Closed│
│  Nurse          │       │       │       │       │       │(8-13) │      │
│  (Nurse only)   │       │       │       │       │       │       │      │
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│  Unassigned     │DrJean │DrJean │DrJean │DrJean │DrJean │Trinity│DrJean│
│  Drag to sched  │Sibusi.│Sibusi.│Sibusi.│Sibusi.│Sibusi.│Sibusi.│Trinit│
│                 │ < · > │ < · > │ < · > │ < · > │ < · > │ < · > │< · >│
│  ───────────────│───────│───────│───────│───────│───────│───────│──────│
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────┐       │
│  │ Staff Hours This Week                                         │       │
│  │ Dinah: 7 shifts · 62h   Ntombi: 7 shifts · 64h              │       │
│  │ Nneka: 6 shifts · 58h   Dr Jean: 1 shift · 10h              │       │
│  └──────────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────────┘
```

**Cell States & Colors:**
| State                    | Left Border | Background     |
|--------------------------|-------------|----------------|
| Needs nurse              | Red         | Red-50         |
| Needs receptionist       | Amber       | Amber-50       |
| Nurse working alone      | Amber       | Amber-50       |
| Fully staffed            | Green       | White          |
| Today's column           | —           | Teal-50        |
| Closed (Sunday clinic)   | Gray        | Gray-50        |

**Staff Badges:**
```
Nurse badge:      [🩺 Dinah    🔒 ✕]    (blue/teal background)
                  [🩺 Ntombi (9-13) ✕]  (with custom time range)

Receptionist:     [🎧 Yondi    🔒 ✕]    (pink background)

Badge colors match staff.color property (red/orange/amber/green/teal/blue/purple/pink)
```

**Badge Interactions:**
- Drag (grip handle) → move to another cell
- Lock icon → toggle locked status
- X button → remove assignment
- Hover → shows lock/unlock + delete controls

---

### 4.4 Assignment Modal

Triggered by clicking `+ Assign` on any empty cell.

```
┌────────────────────────────────────┐
│  Assign Nurse                    ✕ │
│  Parkview — Tuesday                │
│  (time slots available)            │
│                                    │
│  ┌────────────────────────────┐    │
│  │ Dr Jean                    │    │
│  │ (Main branch) (Can work    │    │
│  │  alone)           0 shifts │    │
│  ├────────────────────────────┤    │
│  │ Sibusiso            0 shifts│   │
│  ├────────────────────────────┤    │
│  │ Dinah                      │    │
│  │ (Main branch) (Can work    │    │
│  │  alone)           1 shifts │    │
│  ├────────────────────────────┤    │
│  │ Ntombi                     │    │
│  │ (Main branch) (Can work    │    │
│  │  alone)           0 shifts │    │
│  └────────────────────────────┘    │
│                                    │
│  Shows only staff who:             │
│  - Have correct role               │
│  - Can work at this branch         │
│  - Are available on this day       │
│  - Don't have a time conflict      │
└────────────────────────────────────┘
```

### 4.5 Time Picker Modal

Triggered after selecting a staff member from the Assignment Modal.

```
┌────────────────────────────────────┐
│  ⏱ Select Time Slot             ✕ │
│  Dr Jean — Parkview                │
│                                    │
│  ┌────────────────────────────┐    │
│  │ Morning (9-14)             │    │
│  └────────────────────────────┘    │
│  ┌────────────────────────────┐    │
│  │ Afternoon (14-18)          │    │
│  └────────────────────────────┘    │
│  ┌────────────────────────────┐    │
│  │ Full Day (9-18)            │    │
│  └────────────────────────────┘    │
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐    │
│  │ Custom times...            │    │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘    │
└────────────────────────────────────┘
```

**After clicking "Custom times...":**

```
┌────────────────────────────────────┐
│  ⏱ Select Time Slot             ✕ │
│  Dr Jean — Parkview                │
│                                    │
│  Start  [  09:00  ⏱ ]             │
│                                    │
│  End    [  18:00  ⏱ ]             │
│                                    │
│  ⚠ End time must be after start   │
│  ⚠ Conflicts with existing shift  │
│                                    │
│  [ Back ]  [ ████ Assign ████ ]   │
│                                    │
│  Assign disabled when:             │
│  - End <= Start                    │
│  - Time conflicts with existing    │
│    assignment on same day          │
└────────────────────────────────────┘
```

**Split Point Calculation:**
- Midpoint = `round((open + close) / 2)` to nearest hour
- Example: Parkview Mon (9-18) → midpoint = 14:00
  - Morning: 9-14, Afternoon: 14-18, Full Day: 9-18
- Example: Clinic Sat (8-13) → midpoint = 11:00
  - Morning: 8-11, Afternoon: 11-13, Full Day: 8-13

**Slot Filtering:**
- Slots conflicting with staff's existing assignments are hidden
- If only 1 slot available, auto-assigns (no picker shown)

---

### 4.6 Staff Management

```
┌─────────────────────────────────────────────────────────────────┐
│  Staff Management                              [+ Add Staff]    │
│  16 staff members                                               │
│                                                                  │
│  [All] [Nurses] [Receptionists] [Permanent]                    │
│                                                                  │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐│
│  │ ● Jaco (Manager) │ │ ● Ian            │ │ ● Nothando       ││
│  │ receptionist     │ │ receptionist     │ │ receptionist     ││
│  │ parttime    [✏🗑]│ │ parttime    [✏🗑]│ │ parttime    [✏🗑]││
│  │                  │ │                  │ │                  ││
│  │ Parkview ★       │ │ Parkview,        │ │ Rosebank Mall,   ││
│  │ Fri, Sat, Sun    │ │ Rosebank Mall    │ │ Clearwater ★     ││
│  │ only             │ │                  │ │                  ││
│  │                  │ │ ⊘ Min 4 shifts/  │ │                  ││
│  │ Manager. Only    │ │   week           │ │                  ││
│  │ works Fri-Sun.   │ │                  │ │                  ││
│  └──────────────────┘ └──────────────────┘ └──────────────────┘│
│                                                                  │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐│
│  │ ★ Nneka          │ │ ● Dr Jean        │ │ ● Trinity        ││
│  │ nurse  parttime  │ │ nurse  parttime  │ │ nurse  parttime  ││
│  │                  │ │                  │ │                  ││
│  │ Rosebank Mall ★  │ │ Parkview,        │ │ Parkview ★       ││
│  │ ✓ Can work alone │ │ Clearwater ★     │ │ Sat, Sun only    ││
│  │                  │ │ ✓ Can work alone │ │ ✓ Can work alone ││
│  └──────────────────┘ └──────────────────┘ └──────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

**Staff Card Elements:**
- Color dot indicator (matches staff.color)
- Name + role badge + employment type badge
- Priority star (★) on priority staff
- Branch list (main branch marked with ★)
- Available days (if restricted)
- Constraint icons: can work alone, min shifts, weekend both-or-none
- Notes text (italic, gray)
- Edit (pencil) and Delete (trash) buttons

**Add/Edit Form:**
- Name, Role, Employment Type
- Can work alone, Priority, Also Manager (checkboxes)
- Branch selection (checkboxes), Main branch (dropdown)
- Available days (toggle buttons), Weekend both-or-none
- Min shifts/week, Monthly hours target
- Color tag selector (9 options)
- Notes textarea

---

### 4.7 Availability & Requests

**Tab 1: Leave / Unavailable**

```
┌─────────────────────────────────────────────────────────────────┐
│  Availability & Requests          < [This Week] 23 Feb-01 Mar >│
│  Mark leave days and shift requests for the week                │
│                                                                  │
│  [Leave / Unavailable]  [Shift Requests (Priority Staff)]       │
│                                                                  │
│  Staff Member    Mon   Tue   Wed   Thu   Fri   Sat   Sun       │
│  ──────────────  ────  ────  ────  ────  ────  ────  ────      │
│  NURSES                                                         │
│  Nneka ★          ✓     ✓     ✓     ✓     ✓     ✓     ✓       │
│  Dr Jean          ✓     ✓     ✓     ✓     ✓     ✓     ✓       │
│  Trinity         N/A   N/A   N/A   N/A   N/A    ✓     ✓       │
│  Sibusiso         ✓     ✓     ✓     ✓     ✓     ✓     ✓       │
│  ...                                                            │
│  RECEPTIONISTS                                                  │
│  Jaco            N/A   N/A   N/A   N/A    ✓     ✓     ✓       │
│  Ian              ✓     ✓     ✓     ✓     ✓     ✓     ✓       │
│  ...                                                            │
│                                                                  │
│  ✓ = Available (green)   OFF = On leave (red)   N/A = Restricted│
└─────────────────────────────────────────────────────────────────┘
```

**Tab 2: Shift Requests (Priority Staff Only)**

```
┌─────────────────────────────────────────────────────────────────┐
│  Staff Member    Mon       Tue       Wed       ...              │
│  ──────────────  ────────  ────────  ────────  ────────        │
│  Nneka ★        [Rosebank▼][Rosebank▼][Rosebank▼] ...         │
│  Dinah ★        [Parkview▼][Parkview▼][Parkview▼] ...         │
│  Ntombi ★       [Parkview▼][Parkview▼][Parkview▼] ...         │
│                                                                  │
│  ℹ Priority staff get all their requested shifts assigned       │
│    before other staff. Use the dropdowns to set which branch    │
│    each priority staff member prefers per day.                  │
│                                                                  │
│  Dropdown options:                                              │
│  - No request (default)                                         │
│  - Parkview ★ (if main branch)                                 │
│  - Clearwater Mall                                              │
│  - Rosebank Mall                                                │
│  - Colon Clinic                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### 4.8 Monthly Hours Tracker

```
┌─────────────────────────────────────────────────────────────────┐
│  Monthly Hours Tracker                     < March 2026 >      │
│  Track hours for permanent staff targets                        │
│                                                                  │
│  ┌─ Permanent Staff — Hours Tracking ────────────────────┐     │
│  │                                                        │     │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐            │     │
│  │  │ Yondi    │  │ Dinah    │  │ Ntombi   │            │     │
│  │  │ recept.  │  │ nurse    │  │ nurse    │            │     │
│  │  │   0h     │  │   0h     │  │   0h     │            │     │
│  │  │ TBD tgt  │  │ TBD tgt  │  │ TBD tgt  │            │     │
│  │  └──────────┘  └──────────┘  └──────────┘            │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                  │
│  Staff Member  Shifts Hours Target Progress Wk1 Wk2 Wk3 Wk4   │
│  ──────────── ────── ───── ────── ──────── ─── ─── ─── ───    │
│  PERMANENT STAFF                                                │
│  Yondi          0     0h    TBD     ━━━━     -   -   -   -    │
│  Dinah          0     0h    TBD     ━━━━     -   -   -   -    │
│  Ntombi         0     0h    TBD     ━━━━     -   -   -   -    │
│  PART-TIME & LOCUM                                              │
│  Jaco           0     0h                     -   -   -   -    │
│  Ian            0     0h                     -   -   -   -    │
│  ...                                                            │
│                                                                  │
│  Progress bar colors:                                           │
│  Green  = On track (within target)                              │
│  Amber  = Under 80% of target                                  │
│  Red    = Over 100% of target                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 5. Auto-Scheduling Algorithm

### 7-Step Priority Algorithm

```
Step 1: PRIORITY STAFF REQUESTS
  ├─ For each priority staff (Nneka, Dinah, Ntombi)
  ├─ Assign to their requested branch for each day
  ├─ Try: requested branch → mainBranch → alsoMainBranch (skip clinic)
  └─ Skip days they're unavailable or on leave

Step 2: FIXED-DAY STAFF
  ├─ Jaco → Parkview receptionist (Fri, Sat, Sun)
  ├─ Trinity → Parkview nurse (Sat, Sun)
  └─ Nomonde → Both Sat+Sun or neither (preferred: Parkview/Clearwater)

Step 3: FILL NURSE GAPS
  ├─ For each branch (non-clinic) with open nurse slots
  ├─ Sort candidates: main branch match → regular → least shifts
  └─ Skip: unavailable, already assigned, last-resort branches

Step 4: FILL RECEPTIONIST GAPS
  ├─ For each branch (non-clinic) needing receptionist
  ├─ Sort: main branch → permanent → least shifts
  └─ Consider: managers (Jaco) can fill if needed

Step 5: IAN'S MINIMUM SHIFTS
  ├─ If Ian has < 4 shifts after Steps 1-4
  ├─ Find empty receptionist slots → assign
  └─ If still short: fill any available slot

Step 6: SATURDAY SPLIT-SHIFT (Clinic)
  ├─ Only runs for Saturday
  ├─ Find nurse at Parkview who can also work clinic
  ├─ Split: Clinic 08:00-13:00 + Parkview 13:00-17:00
  └─ Prefer staff with alsoMainBranch: 'clinic' (Dinah/Ntombi)

Step 7: CLINIC OVERFLOW (Non-Saturday)
  ├─ If all main branches fully staffed
  ├─ Find spare nurses who can work at clinic
  └─ Assign to clinic for remaining weekdays
```

### Validation Rules

| Rule                                  | Severity |
|---------------------------------------|----------|
| Open branch has no nurse              | Error    |
| Branch exceeds max nurses             | Error    |
| Open branch has no receptionist       | Warning  |
| Nurse working alone (can't work alone)| Error    |
| Nurse working alone (can work alone)  | Warning  |
| Double-booked staff (time conflict)   | Error    |
| Ian has < 4 shifts                    | Warning  |
| Nomonde has only 1 weekend day        | Warning  |

### Max Nurses Per Branch

| Branch     | Day       | Max Nurses |
|------------|-----------|------------|
| Parkview   | Saturday  | 2          |
| All others | All days  | 1          |

---

## 6. Drag & Drop Specification

### Drag Sources
1. **Staff badges** in schedule cells (move between cells)
2. **Unassigned staff** from the pool at bottom

### Drop Targets
- Schedule cells matching the dragged staff's role

### Drop Validation
```
canDrop(staffMember, targetDay, targetBranch, targetRole) {
  1. Role must match (nurse → nurse cell, receptionist → receptionist cell)
  2. Staff must be able to work at target branch
  3. Cell must not be at max capacity
  4. No time conflict with existing assignments on that day
  5. If staff has partial shift elsewhere:
     → Check if non-overlapping time slot available
     → Show time picker if multiple slots
}
```

### Drop Behavior
- **Same day, different branch:** Move assignment (remove from source, add to target)
- **Different day:** Copy to target (source unchanged)
- **From unassigned pool:** Add new assignment
- **With time conflicts:** Show time picker modal for partial slot selection

---

## 7. Excel Export Specification

### Sheet 1: Weekly Schedule

```
┌──────────────────────────────────────────────────────────┐
│                      Parkview                             │
├──────┬──────┬──────────────┬───────┬──────────────┬──────┤
│ Day  │ Date │     RN       │ Times │ Receptionist │ Times│
├──────┼──────┼──────────────┼───────┼──────────────┼──────┤
│ Mon  │  23  │ Dinah        │ 9-18  │ Yondi        │ 9-18 │
│ Tue  │  24  │ Dinah        │ 9-18  │ Yondi        │ 9-18 │
│ Wed  │  25  │ Dinah        │ 9-18  │ Yondi        │ 9-18 │
│ Thu  │  26  │ Dinah        │ 9-18  │ Yondi        │ 9-18 │
│ Fri  │  27  │ Dinah        │ 9-18  │ Jaco         │ 9-18 │
│ Sat  │  28  │ Ntombi       │ 9-13  │ Jaco         │ 9-17 │
│      │      │ Dinah        │ 13-17 │              │      │
│ Sun  │   1  │ Dinah        │10-16  │ Jaco         │10-16 │
├──────┴──────┴──────────────┴───────┴──────────────┴──────┤
│                                                           │
│                    Colon Clinic                            │
├──────┬──────┬──────────────┬───────┤                      │
│ Day  │ Date │     RN       │ Times │  ← Only 4 columns   │
├──────┼──────┼──────────────┼───────┤    (no receptionist) │
│ Mon  │  23  │ None         │ 7-16  │  ← "None" in RED    │
│ ...  │      │              │       │                      │
│ Sat  │  28  │ Dinah        │ 8-13  │                      │
│ Sun  │   1  │              │       │  ← Closed (blank)    │
└──────┴──────┴──────────────┴───────┘
```

**Styling:**
- Branch header: Bold 14pt, merged across all columns
- Column headers: Bold 11pt, yellow (#FFFF00) background
- Day/Date: Bold 12pt
- RN names: 11pt, colored to match staff color tag
- "None": 11pt, RED (#FF0000)
- Times: 9pt
- All cells: Medium black borders, centered
- Split shifts: Multi-line with wrap text (name per line, time per line)
- Day order: Monday → Sunday
- Clinic sections: 4 columns only (Day, Date, RN, Times)

### Sheet 2: Staff Hours

```
┌──────────────┬──────┬──────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬────────┬───────┐
│ Staff Member │ Role │ Type │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │ Sun │ Shifts │ Hours │
├──────────────┼──────┼──────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼────────┼───────┤
│ Dinah        │Nurse │Perm  │ PV  │ PV  │ PV  │ PV  │ PV  │PV+CL│ PV  │   8    │  62   │
│ Ntombi       │Nurse │Perm  │ CW  │ CW  │ CW  │ CW  │ CW  │ PV  │ CW  │   7    │  64   │
│ Nneka        │Nurse │PT    │ RB  │ RB  │ RB  │ RB  │ RB  │  -  │ RB  │   6    │  58   │
│ ...          │      │      │     │     │     │     │     │     │     │        │       │
└──────────────┴──────┴──────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴────────┴───────┘
```

- Branch abbreviations or full names per day
- Multiple branches joined with " + " (e.g., "Parkview + Clinic")
- Custom shift hours calculated from shiftStart/shiftEnd when present
- "-" for days with no assignment

---

## 8. Firebase Storage Schema

```
Firebase Realtime Database:
├── staff/                          # Staff list (array)
│   ├── 0: { id, name, role, ... }
│   └── ...
├── schedules/                      # Keyed by week Monday date
│   └── "2026-02-23"/
│       ├── Monday/
│       │   ├── parkview/
│       │   │   ├── nurses/
│       │   │   │   └── 0: { id: "dinah", name: "Dinah", locked: true }
│       │   │   └── receptionists/
│       │   │       └── 0: { id: "yondi", name: "Yondi", locked: false }
│       │   ├── clearwater/ ...
│       │   ├── rosebank/ ...
│       │   └── clinic/ ...
│       ├── Tuesday/ ...
│       └── ...
├── availability/                   # Leave dates per staff
│   └── "dinah": ["2026-03-05", "2026-03-06"]
└── shiftRequests/                  # Priority staff branch preferences
    └── "nneka"/
        ├── Monday: "rosebank"
        └── Tuesday: "rosebank"
```

**Normalization:** Firebase drops empty arrays/objects. `normalizeSchedules()` ensures every branch cell has `{ nurses: [], receptionists: [] }` and preserves optional `shiftStart`/`shiftEnd` fields on assignments.

---

## 9. Color System

### Brand Colors
| Token            | Hex      | Usage              |
|------------------|----------|--------------------|
| Primary          | #0f766e  | Sidebar, buttons   |
| Primary Light    | #14b8a6  | Highlights, today  |
| Primary Dark     | #0d5f58  | Sidebar gradient   |
| Accent           | #f59e0b  | Warnings, amber    |
| Danger           | #ef4444  | Errors, red        |
| Success          | #22c55e  | Coverage OK, green |

### Branch Colors
| Branch          | Color   | Hex      |
|-----------------|---------|----------|
| Parkview        | Blue    | #3b82f6  |
| Clearwater Mall | Purple  | #8b5cf6  |
| Rosebank Mall   | Pink    | #ec4899  |
| Colon Clinic    | Orange  | #f97316  |

### Staff Color Tags
| Tag    | Hex     | Staff                         |
|--------|---------|-------------------------------|
| Red    | #ef4444 | —                             |
| Orange | #f97316 | —                             |
| Amber  | #f59e0b | —                             |
| Green  | #22c55e | Jaco, Ian, Nothando           |
| Teal   | #14b8a6 | Yondi, Thabang, Nomonde       |
| Blue   | #3b82f6 | Nneka, Dr Jean, Trinity       |
| Purple | #8b5cf6 | Sibusiso, Ringisani, Vuyelwa  |
| Pink   | #ec4899 | Samantha, Lindokuhle          |

---

## 10. File Structure

```
iv-scheduler/
├── index.html
├── package.json
├── vite.config.js
├── src/
│   ├── main.jsx                    # React entry point
│   ├── index.css                   # Tailwind + custom styles
│   ├── App.jsx                     # Root component, state, Firebase listeners
│   ├── data/
│   │   └── initialData.js          # Branches, staff defaults, helpers
│   ├── utils/
│   │   ├── scheduler.js            # Auto-schedule algorithm + validation
│   │   ├── exportExcel.js          # Excel workbook generation
│   │   ├── firebase.js             # Firebase config & initialization
│   │   └── storage.js              # localStorage + Firebase read/write
│   └── components/
│       ├── Sidebar.jsx             # Navigation sidebar
│       ├── Dashboard.jsx           # Overview metrics & branch grids
│       ├── WeeklySchedule.jsx      # Main schedule grid (drag-drop, modals)
│       ├── StaffManager.jsx        # Staff CRUD interface
│       ├── AvailabilityManager.jsx # Leave & shift request management
│       └── MonthlyHours.jsx        # Monthly hours tracking
└── .env                            # Firebase credentials (VITE_FIREBASE_*)
```

---

## 11. Key User Flows

### Flow 1: Generate Weekly Schedule
1. Navigate to **Weekly Schedule** page
2. Select target week with `<` `>` arrows or "Today"
3. (Optional) Set availability on **Availability** page
4. (Optional) Set shift requests for priority staff
5. Click **Auto Schedule** → algorithm runs 7 steps
6. Review: green = good, red/amber = issues to fix
7. Manually adjust by dragging badges or clicking **+ Assign**
8. Lock important assignments (click lock icon)
9. Click **Export Excel** to download formatted spreadsheet

### Flow 2: Manual Assignment with Custom Times
1. Click **+ Assign** on any empty schedule cell
2. Select staff member from filtered list
3. Time picker appears: Morning / Afternoon / Full Day / Custom
4. Select preset slot OR click "Custom times..."
5. Enter custom start/end times
6. Click **Assign** (validates no conflicts)
7. Badge appears with time range (e.g., "Dinah (9-14)")

### Flow 3: Split Shift (Saturday Clinic)
1. Auto Schedule handles automatically, OR:
2. Assign nurse to Clinic Saturday → gets 08:00-13:00
3. Same nurse appears in Unassigned pool (partial day)
4. Assign same nurse to Parkview Saturday → pick Afternoon (13-17)
5. Both badges show with respective time ranges

### Flow 4: Staff Management
1. Navigate to **Staff** page
2. Click **+ Add Staff** for new, or **pencil icon** to edit
3. Fill form: name, role, branches, constraints
4. Save → staff appears in scheduling pool
5. Delete with confirmation via trash icon

---

*Document generated: March 2026*
*Application version: Current (main branch)*
