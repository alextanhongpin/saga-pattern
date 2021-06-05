package main

import (
	"context"
	"errors"
)

type InMemoryStore struct {
	sagas map[string]Saga
}

func NewInMemoryStore() *InMemoryStore {
	return &InMemoryStore{
		sagas: make(map[string]Saga),
	}
}

func (r *InMemoryStore) FindSaga(ctx context.Context, id string) (Saga, error) {
	saga, ok := r.sagas[id]
	if !ok {
		return Saga{}, errors.New("not found")
	}
	return saga, nil
}

func (r *InMemoryStore) UpdateSaga(ctx context.Context, saga *Saga) (Saga, error) {
	cp := *saga
	r.sagas[cp.ID] = cp
	return cp, nil
}

func (r *InMemoryStore) CreateSaga(ctx context.Context, saga *Saga) (Saga, error) {
	cp := *saga
	cp.ID = "1"
	r.sagas[cp.ID] = cp
	return cp, nil
}
