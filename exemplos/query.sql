-- Exemplo de consulta SQL
SELECT 
    u.id AS user_id,
    u.name AS full_name,
    u.email,
    COUNT(o.id) AS total_orders,
    SUM(o.amount) AS total_spent
FROM users u
INNER JOIN orders o ON o.user_id = u.id
WHERE u.status = 'active' AND o.created_at >= '2026-01-01'
GROUP BY u.id, u.name, u.email
HAVING COUNT(o.id) > 5
ORDER BY total_spent DESC
LIMIT 50;
