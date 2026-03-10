const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/blockminer.db');

const IMAGE_URL = '/assets/machines/reward2.png';
const MINER_NAME = 'GPU 1 GHS';

// Atualiza todos itens de inventário com nome 'GPU 1 GHS' e hash_rate = 1
// para garantir que tenham a imagem correta

db.serialize(() => {
  db.run(
    `ALTER TABLE user_inventory ADD COLUMN image_url TEXT`,
    function (err) {
      if (err && !String(err.message).includes('duplicate column')) {
        console.error('Erro ao adicionar coluna image_url:', err);
      } else {
        console.log('Coluna image_url adicionada ou já existe.');
      }
    }
  );

  db.run(
    `UPDATE user_inventory SET image_url = ? WHERE miner_name = ? AND hash_rate = 1`,
    [IMAGE_URL, MINER_NAME],
    function (err) {
      if (err) {
        console.error('Erro ao atualizar inventário:', err);
      } else {
        console.log(`Atualizados ${this.changes} itens de inventário para GPU 1 GHS.`);
      }
    }
  );
});

db.close();
