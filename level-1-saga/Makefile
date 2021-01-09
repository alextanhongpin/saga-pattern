include .env
export

up:
	@docker-compose up -d

down:
	@docker-compose down

start-payment:
	@PORT=4000 node payment/index.js

start-delivery:
	@PORT=5000 node delivery/index.js

start-order:
	@PORT=6000 node order/index.js

start-orchestrator:
	@node index.js
