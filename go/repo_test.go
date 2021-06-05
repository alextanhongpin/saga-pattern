package main

import (
	"context"
	"testing"

	"github.com/google/go-cmp/cmp"
	"github.com/stretchr/testify/assert"
)

func TestRepo_FindSaga(t *testing.T) {
	ctx := context.Background()

	t.Run("when not exists", func(t *testing.T) {
		assert := assert.New(t)

		store := NewInMemoryStore()
		_, err := store.FindSaga(ctx, "1")
		assert.NotNil(err)
	})

	t.Run("when exists", func(t *testing.T) {
		assert := assert.New(t)
		store := NewInMemoryStore()

		created, err := store.CreateSaga(ctx, &Saga{
			Name: "hello",
		})
		assert.Nil(err)

		saga, err := store.FindSaga(ctx, created.ID)
		assert.Nil(err)
		if diff := cmp.Diff(created, saga); diff != "" {
			t.Errorf("saga diff (-want, +got):\n %s", diff)
		}
	})
}
