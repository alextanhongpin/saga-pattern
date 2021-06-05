package main

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestSaga(t *testing.T) {
	t.Run("when all steps are pending", func(t *testing.T) {
		saga := &Saga{
			ID:      "1",
			Name:    "booking-saga",
			Version: 1,
			Steps: []Step{
				{Name: "create-booking", Status: "pending"},
				{Name: "create-payment", Status: "pending"},
				{Name: "confirm-booking", Status: "pending"},
			},
		}

		assert.Equal(t, "pending", saga.CheckStatus())
	})

	t.Run("when one step failed", func(t *testing.T) {
		saga := &Saga{
			ID:      "1",
			Name:    "booking-saga",
			Version: 1,
			Steps: []Step{
				{Name: "create-booking", Status: "success"},
				{Name: "create-payment", Status: "failed"},
				{Name: "confirm-booking", Status: "pending"},
			},
		}

		assert.Equal(t, "compensating", saga.CheckStatus())
	})

	t.Run("when all steps completed", func(t *testing.T) {
		saga := &Saga{
			ID:      "1",
			Name:    "booking-saga",
			Version: 1,
			Steps: []Step{
				{Name: "create-booking", Status: "success"},
				{Name: "create-payment", Status: "success"},
				{Name: "confirm-booking", Status: "success"},
			},
		}

		assert.Equal(t, "done", saga.CheckStatus())
	})

	t.Run("when all steps compensated", func(t *testing.T) {
		saga := &Saga{
			ID:      "1",
			Name:    "booking-saga",
			Version: 1,
			Steps: []Step{
				{Name: "create-booking", Status: "compensated"},
				{Name: "create-payment", Status: "compensated"},
				{Name: "confirm-booking", Status: "failed"},
			},
		}

		assert.Equal(t, "done", saga.CheckStatus())
	})

	t.Run("when second step failed and first step is compensated", func(t *testing.T) {

		saga := &Saga{
			ID:      "1",
			Name:    "booking-saga",
			Version: 1,
			Steps: []Step{
				{Name: "create-booking", Status: "compensated"},
				{Name: "create-payment", Status: "failed"},
				{Name: "confirm-booking", Status: "pending"},
			},
		}

		assert.Equal(t, "done", saga.CheckStatus())
	})
}
