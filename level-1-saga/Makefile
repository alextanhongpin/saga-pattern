include .env
export

up:
	@docker-compose up -d

down:
	@docker-compose down

# Create in this sequence.
# 1
start-payment:
	@PORT=4000 node payment/index.js

# 2
start-delivery:
	@PORT=5000 node delivery/index.js


# 3
start-orchestrator:
	@node index.js

# 4
start-order:
	@PORT=6000 node order/index.js
