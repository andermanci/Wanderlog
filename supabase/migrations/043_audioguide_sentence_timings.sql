-- ============================================================
-- WANDERLOG - Frases del guion con timestamp para el resaltado sincronizado
-- ============================================================
-- [{ "text": string, "start": number }] ordenado por inicio (segundos).
-- Lo rellena la edge function audioguide-tts con los timepoints de Google
-- TTS v1beta1. NULL = audio generado antes de esta función: el cliente
-- estima los tiempos proporcionalmente a la longitud de cada frase.

alter table public.audioguide_stops
  add column if not exists sentence_timings jsonb;
