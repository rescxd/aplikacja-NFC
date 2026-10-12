# NFC Business Desk

Polskojęzyczny panel do zarządzania klientami, płatnościami abonamentowymi, dostawami, stanami magazynowymi i kosztami.

## Uruchomienie

```sh
npm install
npm run dev
```

Bez skonfigurowanego Supabase dane zapisują się wyłącznie w `localStorage` tej przeglądarki.

## Konta demonstracyjne

Konta i hasła znajdują się w `src/config.ts`. Zmień je przed użyciem. To tylko ekran dostępu: dane logowania są częścią publicznego bundle'a i nie zabezpieczają aplikacji.

## Supabase

Skopiuj `.env.example` do `.env.local` i uzupełnij `VITE_SUPABASE_URL` oraz `VITE_SUPABASE_PUBLISHABLE_KEY`. Uruchom SQL z `supabase/schema.sql` w edytorze Supabase. Schemat włącza RLS i celowo nie dodaje publicznych polityk dostępu.

Obecny configowy login nie uwierzytelnia żądań Supabase. Nie dodawaj polityki `anon` z pełnym dostępem ani klucza `SUPABASE_SECRET_KEY` do zmiennych `VITE_*`. Do bezpiecznej synchronizacji między użytkownikami i urządzeniami potrzebne są Supabase Auth oraz polityki RLS (lub zaufana funkcja serwerowa). Bez tych elementów aplikacja działa lokalnie.

## Wdrożenie

Projekt jest aplikacją Vite i może być wdrożony jako frontend na Vercel. Ustaw komendę build `npm run build` i katalog wyjściowy `dist`. Sam Vercel nie zapewnia współdzielonego zapisu danych.
