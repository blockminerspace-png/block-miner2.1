-- B7: Alinha period_day_starts_at ao dia minerado (não ao dia do pagamento).
-- Estorna autos inválidos (pré-lançamento ou duplicados após correção).

DO $$
DECLARE
  first_taxable timestamptz := '2026-06-29 03:00:00+00';
  rec RECORD;
BEGIN
  -- 1) Estornar e remover cobranças auto anteriores ao primeiro dia taxável
  FOR rec IN
    SELECT id, user_id, amount
    FROM energy_tax_charges
    WHERE mode = 'auto'
      AND period_day_starts_at < first_taxable
      AND amount > 0
  LOOP
    INSERT INTO transactions (user_id, type, amount, status, completed_at, created_at)
    VALUES (rec.user_id, 'energy_tax_refund', rec.amount, 'completed', NOW(), NOW());
    UPDATE users SET pol_balance = pol_balance + rec.amount WHERE id = rec.user_id;
  END LOOP;
  DELETE FROM energy_tax_charges
  WHERE mode = 'auto' AND period_day_starts_at < first_taxable;

  -- 2) Estornar autos que conflitam com daily/exempt ainda no dia de pagamento (antes do shift)
  FOR rec IN
    SELECT DISTINCT a.id, a.user_id, a.amount
    FROM energy_tax_charges a
    WHERE a.mode = 'auto' AND a.amount > 0
      AND (
        EXISTS (
          SELECT 1 FROM energy_tax_charges d
          WHERE d.user_id = a.user_id
            AND d.mode = 'daily'
            AND d.period_day_starts_at = a.period_day_starts_at + INTERVAL '1 day'
        )
        OR EXISTS (
          SELECT 1 FROM energy_tax_charges e
          WHERE e.user_id = a.user_id
            AND e.mode = 'exempt'
            AND e.period_day_starts_at = a.period_day_starts_at + INTERVAL '1 day'
            AND (
              e.notes LIKE '%concluídos hoje%'
              OR e.notes LIKE '%dia do pagamento%'
            )
        )
      )
  LOOP
    INSERT INTO transactions (user_id, type, amount, status, completed_at, created_at)
    VALUES (rec.user_id, 'energy_tax_refund', rec.amount, 'completed', NOW(), NOW());
    UPDATE users SET pol_balance = pol_balance + rec.amount WHERE id = rec.user_id;
    DELETE FROM energy_tax_charges WHERE id = rec.id;
  END LOOP;

  -- 3) Recuar 1 dia: manual daily e exempt registrados no dia do pagamento
  UPDATE energy_tax_charges
  SET period_day_starts_at = period_day_starts_at - INTERVAL '1 day'
  WHERE mode = 'daily'
     OR (mode = 'exempt' AND notes LIKE '%concluídos hoje%');

  UPDATE energy_tax_charges
  SET period_day_starts_at = period_day_starts_at - INTERVAL '1 day'
  WHERE mode = 'exempt' AND notes LIKE '%dia do pagamento%';

  -- 4) Remover autos duplicados quando já existe daily/exempt no mesmo dia minerado
  FOR rec IN
    SELECT a.id, a.user_id, a.amount
    FROM energy_tax_charges a
    WHERE a.mode = 'auto' AND a.amount > 0
      AND EXISTS (
        SELECT 1 FROM energy_tax_charges o
        WHERE o.user_id = a.user_id
          AND o.period_day_starts_at = a.period_day_starts_at
          AND o.mode IN ('daily', 'exempt')
          AND o.id <> a.id
      )
  LOOP
    INSERT INTO transactions (user_id, type, amount, status, completed_at, created_at)
    VALUES (rec.user_id, 'energy_tax_refund', rec.amount, 'completed', NOW(), NOW());
    UPDATE users SET pol_balance = pol_balance + rec.amount WHERE id = rec.user_id;
    DELETE FROM energy_tax_charges WHERE id = rec.id;
  END LOOP;
END $$;
