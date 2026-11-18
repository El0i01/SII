-- P16 · Anexo de evidências do relatório ao TCE: casos encerrados no período com o código
-- verificador da trilha. SECURITY DEFINER para o auditor ler sem acesso à tabela nominal: só
-- código, tipo, data de encerramento, número de eventos e verificador (nada de pessoa ou `dados`).
CREATE OR REPLACE FUNCTION casos.trilhas_encerradas(p_de date, p_ate date)
  RETURNS TABLE (codigo text, tipo text, encerrado_em timestamptz, eventos int, verificador text)
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS
$$
  SELECT c.codigo::text, c.tipo::text, c.encerrado_em, u.eventos,
         upper(substr(encode(u.hash, 'hex'), 1, 4) || '-' || substr(encode(u.hash, 'hex'), 5, 4) || '-' ||
               substr(encode(u.hash, 'hex'), 9, 4))
  FROM casos.caso c
  JOIN LATERAL (SELECT e.hash, e.seq AS eventos FROM casos.evento_caso e
                WHERE e.caso_id = c.id ORDER BY e.seq DESC LIMIT 1) u ON true
  WHERE c.encerrado_em >= (p_de::timestamp AT TIME ZONE 'America/Porto_Velho')
    AND c.encerrado_em < ((p_ate + 1)::timestamp AT TIME ZONE 'America/Porto_Velho')
  ORDER BY c.encerrado_em, c.codigo;
$$;

REVOKE EXECUTE ON FUNCTION casos.trilhas_encerradas(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION casos.trilhas_encerradas(date, date) TO sii_app, sii_auditor;
