-- Remediação: corte de energia desativado; limpar flags legadas.
UPDATE users SET energy_blocked = false, energy_blocked_at = NULL WHERE energy_blocked = true;
