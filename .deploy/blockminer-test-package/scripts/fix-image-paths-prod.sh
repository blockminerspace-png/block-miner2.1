#!/bin/bash
docker exec block-miner-db-1 psql -U blockminer -d blockminer_db -c "UPDATE miners SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'"
docker exec block-miner-db-1 psql -U blockminer -d blockminer_db -c "UPDATE user_inventory SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'"
docker exec block-miner-db-1 psql -U blockminer -d blockminer_db -c "UPDATE user_miners SET image_url = REPLACE(image_url, '/assets/machines/', '/machines/') WHERE image_url LIKE '/assets/machines/%'"
echo "Done"
