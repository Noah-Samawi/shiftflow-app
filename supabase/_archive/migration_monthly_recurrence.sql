-- ============================================================
-- Migration: monthly recurrence + employee_weekly_hours view
-- ============================================================

-- 1. Constraint erweitern (monthly hinzufügen)
ALTER TABLE public.schedules
DROP CONSTRAINT IF EXISTS schedules_recurrence_check;
ALTER TABLE public.schedules
ADD CONSTRAINT schedules_recurrence_check
CHECK (recurrence IN ('once','weekly','biweekly','monthly'));

-- 2. Funktion mit monthly erweitern
CREATE OR REPLACE FUNCTION public.create_schedules_with_recurrence(
  p_employee_id uuid,
  p_customer_id uuid,
  p_shift_date  date,
  p_start_time  time,
  p_end_time    time,
  p_tasks       text    DEFAULT NULL,
  p_recurrence  text    DEFAULT 'once',
  p_status      text    DEFAULT 'scheduled',
  p_occurrences integer DEFAULT 12
)
RETURNS SETOF uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  i             integer := 0;
  occ_date      date    := p_shift_date;
  new_series_id uuid    := gen_random_uuid();
  new_id        uuid;
  max_occ       integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Nur Admins dürfen Schichten anlegen';
  END IF;

  max_occ := CASE
    WHEN p_recurrence = 'once' THEN 1
    ELSE GREATEST(1, LEAST(COALESCE(p_occurrences,12), 365))
  END;

  WHILE i < max_occ LOOP
    INSERT INTO public.schedules (
      employee_id, customer_id, shift_date,
      start_time,  end_time,
      tasks, instructions, status, recurrence, series_id
    ) VALUES (
      p_employee_id, p_customer_id, occ_date,
      p_start_time,  p_end_time,
      p_tasks, p_tasks,
      COALESCE(p_status,'scheduled'),
      p_recurrence,
      CASE WHEN p_recurrence = 'once'
        THEN NULL ELSE new_series_id END
    )
    RETURNING id INTO new_id;
    RETURN NEXT new_id;

    -- Nächstes Datum berechnen
    occ_date := CASE p_recurrence
      WHEN 'weekly'   THEN occ_date + 7
      WHEN 'biweekly' THEN occ_date + 14
      WHEN 'monthly'  THEN
        -- Edge-Case: Monatsende korrekt behandeln
        LEAST(
          (date_trunc('month', occ_date)
            + interval '1 month'
            + (EXTRACT(DAY FROM p_shift_date)-1)
              * interval '1 day'
          )::date,
          (date_trunc('month', occ_date)
            + interval '2 month'
            - interval '1 day'
          )::date
        )
      ELSE occ_date + 1
    END;
    i := i + 1;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION public.create_schedules_with_recurrence(
  uuid,uuid,date,time,time,text,text,text,integer
) TO authenticated;

-- 3. View für Wochenstunden-Berechnung
CREATE OR REPLACE VIEW public.employee_weekly_hours AS
SELECT
  p.id            AS employee_id,
  p.full_name,
  date_trunc('week', CURRENT_DATE)::date  AS week_start,
  COALESCE(SUM(
    EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 3600
  ), 0)::numeric(10,1) AS hours_this_week
FROM public.profiles p
LEFT JOIN public.schedules s
  ON  s.employee_id = p.id
  AND s.shift_date >= date_trunc('week', CURRENT_DATE)::date
  AND s.shift_date <  date_trunc('week', CURRENT_DATE)::date + 7
  AND s.status NOT IN ('cancelled')
WHERE p.role = 'employee'
GROUP BY p.id, p.full_name;

GRANT SELECT ON public.employee_weekly_hours TO authenticated;
