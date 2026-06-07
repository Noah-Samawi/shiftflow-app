# Nachbarschaftshilfe — M. Sharif

> **Mitarbeiter- und Schichtverwaltung** für die Nachbarschaftshilfe M. Sharif. Admin-Dashboard, Dienstplan mit Kalender, Kunden- und Mitarbeiterstamm — alles in einer modernen React + Supabase-Anwendung.

[![Vite](https://img.shields.io/badge/Vite-8.0-646CFF?logo=vite)](https://vitejs.dev/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-2.0-3ECF8E?logo=supabase)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-4.0-06B6D4?logo=tailwindcss)](https://tailwindcss.com/)

---

## Inhalt

1. [Funktionen](#funktionen)
2. [Tech-Stack](#tech-stack)
3. [Schnellstart](#schnellstart)
4. [Datenbank-Einrichtung](#datenbank-einrichtung)
5. [Supabase Edge Functions](#supabase-edge-functions)
6. [Ordnerstruktur](#ordnerstruktur)
7. [Authentifizierung & Rollen](#authentifizierung--rollen)
8. [Wiederholende Schichten](#wiederholende-schichten)
9. [Benachrichtigungen](#benachrichtigungen)
10. [Mobile Ansicht](#mobile-ansicht)
11. [Lizenz](#lizenz)

---

## Funktionen

### Admin-Bereich
- **Übersicht (Dashboard):** 4 Metrik-Karten (heutige Schichten, offene, bestätigte, aktive Mitarbeiter) + Tabelle der nächsten 7 Tage
- **Dienstplan:** Interaktiver Kalender mit Tag-, Wochen-, 2-Wochen- und Monatsansicht
- **Kundenverwaltung:** Farbcodierte Kunden mit Kontakt- und Adressdaten
- **Mitarbeiterverwaltung:** Admin legt Mitarbeiter per E-Mail an (inkl. Supabase-Auth)
- **Schichten anlegen:** Mit Wiederholung (einmalig, Mo–Fr, Mo–So, wöchentlich, alle 2 Wochen)

### Mitarbeiter-Bereich
- **Eigener Dienstplan:** Nur eigene Schichten sehen
- **Schicht-Details:** Zeit, Kunde, Aufgaben, Status
- **WhatsApp-Bericht:** Direkt aus der Schicht heraus per WhatsApp melden

### Benachrichtigungen
- **E-Mail:** Neue Schicht per Resend API an Mitarbeiter
- **WhatsApp:** Neue Schicht per Twilio WhatsApp API

---

## Tech-Stack

| Bereich | Technologie |
|---------|-------------|
| Frontend | React 19 + TypeScript + Vite 8 |
| Styling | Tailwind CSS 4 + Tabler Icons |
| State & Auth | Supabase Auth + React Context |
| Datenbank | PostgreSQL (Supabase) mit RLS |
| Kalender-Logik | date-fns |
| Toast-Benachrichtigungen | react-hot-toast |
| Edge Functions | Deno (Supabase Functions) |

---

## Schnellstart

### 1. Repository klonen

```bash
git clone https://github.com/Noah-Samawi/m_sharif.git
cd m_sharif
```

### 2. Abhängigkeiten installieren

```bash
npm install
```

### 3. Umgebungsvariablen

Erstelle eine `.env` Datei im Root:

```bash
VITE_SUPABASE_URL=https://dein-projekt.supabase.co
VITE_SUPABASE_ANON_KEY=dein-anon-key
```

> Die Werte findest du in deinem Supabase-Projekt unter **Project Settings → API**.

### 4. Entwicklungsserver starten

```bash
npm run dev
```

### 5. Produktions-Build

```bash
npm run build
```

---

## Datenbank-Einrichtung

### Einmalig ausführen

Öffne den **Supabase SQL Editor** und führe das komplette Skript aus:

```bash
supabase/core_features_migration.sql
```

Das Skript ist **100 % idempotent** und enthält:

- Tabellen: `profiles`, `customers`, `schedules`, `comments`
- Trigger: `handle_new_user()` — legt Profil bei Registrierung an
- Funktionen: `is_admin()`, `get_my_role()`, `ensure_user_profile()`
- Schicht-Logik: `create_schedules_with_recurrence()` — 5 Wiederholungstypen
- RLS-Policies für alle Tabellen
- Indizes für schnelle Abfragen

### Admin-Account

Der Admin wird automatisch anhand der E-Mail `noahalsamawi688@gmail.com` erkannt. Nach dem ersten Login wird die Rolle `admin` gesetzt.

---

## Supabase Edge Functions

### notify-employee (E-Mail)

Sendet eine E-Mail über die Resend API, wenn eine neue Schicht angelegt wird.

**Deployment:**
```bash
npx supabase functions deploy notify-employee
```

**Umgebungsvariablen (Supabase Dashboard → Edge Functions):**
- `RESEND_API_KEY`

### notify-whatsapp (WhatsApp)

Sendet eine WhatsApp-Nachricht über die Twilio API.

**Deployment:**
```bash
npx supabase functions deploy notify-whatsapp
```

**Umgebungsvariablen:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_WHATSAPP_FROM`

---

## Ordnerstruktur

```
m_sharif/
├── public/                    # Statische Assets
├── src/
│   ├── components/            # React-Komponenten
│   │   ├── scheduler/        # Kalender-Komponenten
│   │   │   ├── SchedulerCalendar.tsx
│   │   │   ├── EmployeeSidebar.tsx
│   │   │   └── ShiftWhatsAppReportButton.tsx
│   │   ├── ShiftDrawer.tsx   # Schicht-Modal (Neu/Bearbeiten)
│   │   ├── ShiftCard.tsx      # Schicht-Karte im Kalender
│   │   └── ...
│   ├── context/              # React Context
│   │   └── AuthContext.tsx   # Auth + Rollen-Logik
│   ├── hooks/              # Custom Hooks
│   │   ├── useAuth.ts
│   │   ├── useCustomers.ts
│   │   ├── useProfiles.ts
│   │   ├── useSchedules.ts
│   │   └── useComments.ts
│   ├── lib/                 # Hilfsfunktionen
│   │   ├── supabaseClient.ts
│   │   └── fetchUserRole.ts
│   ├── pages/              # Seitenkomponenten
│   │   ├── DashboardPage.tsx
│   │   ├── SchedulePage.tsx
│   │   ├── CustomersPage.tsx
│   │   ├── EmployeesPage.tsx
│   │   └── LoginPage.tsx
│   ├── types/              # TypeScript-Typen
│   │   └── database.ts
│   ├── utils/              # Utility-Funktionen
│   │   ├── authErrors.ts   # Deutsche Auth-Fehlermeldungen
│   │   ├── germanHolidays.ts
│   │   ├── formatTime.ts
│   │   └── whatsapp.ts
│   ├── App.tsx
│   ├── App.css
│   ├── index.css
│   └── main.tsx
├── supabase/
│   ├── core_features_migration.sql  # Komplettes SQL-Reset
│   ├── auth_profiles_complete.sql
│   ├── fix_admin_rls.sql
│   └── functions/
│       ├── notify-employee/index.ts   # E-Mail Edge Function
│       └── notify-whatsapp/index.ts # WhatsApp Edge Function
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
└── package.json
```

---

## Authentifizierung & Rollen

| Rolle | Berechtigungen |
|-------|---------------|
| **Admin** | Alles lesen/schreiben/löschen. Schichten anlegen für alle Mitarbeiter. |
| **Employee** | Eigene Schichten sehen. Kommentare schreiben. |

### Sicherheit
- **Row Level Security (RLS)** auf allen Tabellen aktiv
- `is_admin()` Funktion prüft Rolle serverseitig
- `create_schedules_with_recurrence()` erlaubt nur Admin-Aufrufe

---

## Wiederholende Schichten

| Typ | Beschreibung |
|-----|--------------|
| Einmalig | Nur der gewählte Tag |
| Mo–Fr | Täglich, Wochenenden werden übersprungen |
| Mo–So | Täglich inkl. Wochenende |
| Wöchentlich | Jede Woche am gleichen Tag |
| Alle 2 Wochen | Jede zweite Woche |

Alle Schichten einer Serie bekommen dieselbe `series_id`. Die Anzahl der Wiederholungen ist auf 365 begrenzt.

---

## Benachrichtigungen

Beim Anlegen einer Schicht werden automatisch Benachrichtigungen versendet:

1. **E-Mail** an den Mitarbeiter mit Datum, Zeit, Kunde und Aufgaben
2. **WhatsApp** an die hinterlegte Handynummer (falls vorhanden)

> Die Edge Functions laufen asynchron im Hintergrund. Fehler blockieren das Speichern der Schicht nicht.

---

## Mobile Ansicht

Die App ist vollständig responsive:

- **Sidebar** wird auf Mobile ausgeblendet
- **Bottom Navigation** mit 4 Icons (Übersicht, Dienstplan, Kunden, Mitarbeiter)
- **Touch-Targets** mindestens 44 Pixel hoch
- **Kalender** auf Mobile standardmäßig als Tagesansicht

---

## Lizenz

**M. Sharif Nachbarschaftshilfe** — Alle Rechte vorbehalten.

Entwickelt von Noah Al-Samawi.

---

## Support

Bei Problemen mit der Registrierung oder dem SQL-Skript:
1. Stelle sicher, dass `supabase/core_features_migration.sql` im SQL Editor ausgeführt wurde
2. Prüfe, ob der Trigger `on_auth_user_created` existiert (`SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created'`)
3. Für E-Mail/WhatsApp-Benachrichtigungen die Edge Functions deployen und API-Keys hinterlegen
