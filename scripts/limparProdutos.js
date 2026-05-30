require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const pool = require('../config/db');

(async () => {
    try {
        console.log('Conectando ao banco de dados...');

        // Remove dependências na ordem correta
        const [fav]  = await pool.query('DELETE FROM favorito WHERE id_produto IS NOT NULL');
        const [aval] = await pool.query('DELETE FROM avaliacao_produto WHERE id_produto IS NOT NULL');
        const [ic]   = await pool.query('DELETE FROM item_carrinho WHERE id_produto IS NOT NULL');
        const [den]  = await pool.query('DELETE FROM denuncia WHERE id_produto IS NOT NULL');

        // item_pedido tem referência a produto (sem CASCADE)
        const [ip] = await pool.query('DELETE FROM item_pedido WHERE id_produto IS NOT NULL');

        // Por fim, remove todos os produtos
        const [prod] = await pool.query('DELETE FROM produto');

        console.log(`✅ Favoritos removidos:       ${fav.affectedRows}`);
        console.log(`✅ Avaliações removidas:       ${aval.affectedRows}`);
        console.log(`✅ Itens de carrinho removidos: ${ic.affectedRows}`);
        console.log(`✅ Denúncias removidas:         ${den.affectedRows}`);
        console.log(`✅ Itens de pedido removidos:   ${ip.affectedRows}`);
        console.log(`✅ Produtos removidos:           ${prod.affectedRows}`);
        console.log('\nPágina de produtos limpa com sucesso!');
    } catch (err) {
        console.error('❌ Erro:', err.message);
    } finally {
        await pool.end();
    }
})();
