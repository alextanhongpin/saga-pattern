package main

import (
	"context"
	"encoding/json"
	"errors"
)

type repository interface {
	FindSaga(ctx context.Context, id string) (Saga, error)
	CreateSaga(ctx context.Context, saga *Saga) (Saga, error)
	UpdateSaga(ctx context.Context, saga *Saga) (Saga, error)
}

type ExecutionCoordinator struct {
	repo repository
}

func NewExecutionCoordinator(repo repository) *ExecutionCoordinator {
	return &ExecutionCoordinator{
		repo: repo,
	}
}

func (ec *ExecutionCoordinator) CompensationFlow(ctx context.Context, saga Saga) error {
	_, err := ec.rejectBooking(ctx, saga)
	if err != nil {
		return err
	}

	_, err = ec.refundPayment(ctx, saga)
	if err != nil {
		return err
	}

	_, err = ec.cancelBooking(ctx, saga)
	if err != nil {
		return err
	}

	saga.Status = saga.CheckStatus()
	_, err = ec.repo.UpdateSaga(ctx, &saga)
	return err
}

func (ec *ExecutionCoordinator) BookingFlow(ctx context.Context, saga Saga) error {
	createBookingStep, err := ec.createBooking(ctx, saga)
	if err != nil {
		return err
	}
	if createBookingStep.Status != "success" {
		return nil
	}

	createPaymentStep, err := ec.createPayment(ctx, saga)
	if err != nil {
		return err
	}
	if createPaymentStep.Status != "success" {
		return nil
	}

	confirmBookingStep, err := ec.confirmBooking(ctx, saga)
	if err != nil {
		return err
	}
	if confirmBookingStep.Status != "success" {
		return nil
	}

	saga.Status = saga.CheckStatus()
	_, err = ec.repo.UpdateSaga(ctx, &saga)
	return err
}

type CreateBookingCommand struct {
}

func (c CreateBookingCommand) isCommand() {}

func (ec *ExecutionCoordinator) createBooking(ctx context.Context, saga Saga) (*Step, error) {
	return ec.handleCommand(ctx, saga, "create-booking", "pending", "success", CreateBookingCommand{})
}

type CreatePaymentCommand struct {
}

func (c CreatePaymentCommand) isCommand() {}

func (ec *ExecutionCoordinator) createPayment(ctx context.Context, saga Saga) (*Step, error) {
	return ec.handleCommand(ctx, saga, "create-payment", "pending", "success", CreatePaymentCommand{})
}

type ConfirmBookingCommand struct {
}

func (c ConfirmBookingCommand) isCommand() {}

func (ec *ExecutionCoordinator) confirmBooking(ctx context.Context, saga Saga) (*Step, error) {
	return ec.handleCommand(ctx, saga, "confirm-booking", "pending", "success", ConfirmBookingCommand{})
}

type RejectBookingCommand struct {
}

func (c RejectBookingCommand) isCommand() {}

func (ec *ExecutionCoordinator) rejectBooking(ctx context.Context, saga Saga) (*Step, error) {
	return ec.handleCommand(ctx, saga, "confirm-booking", "success", "failed", RejectBookingCommand{})
}

type RefundPaymentCommand struct {
}

func (c RefundPaymentCommand) isCommand() {}

func (ec *ExecutionCoordinator) refundPayment(ctx context.Context, saga Saga) (*Step, error) {
	return ec.handleCommand(ctx, saga, "create-payment", "success", "compensated", RefundPaymentCommand{})
}

type CancelBookingCommand struct {
}

func (c CancelBookingCommand) isCommand() {}

func (ec *ExecutionCoordinator) cancelBooking(ctx context.Context, saga Saga) (*Step, error) {
	return ec.handleCommand(ctx, saga, "create-booking", "success", "compensated", CancelBookingCommand{})
}

type BookingCreated struct {
	ID string
}

func (e BookingCreated) isEvent() {}

func (ec *ExecutionCoordinator) onBookingCreated(ctx context.Context, event BookingCreated) (*Saga, error) {
	saga := NewBookingSaga(event.ID)
	return ec.handleEvent(ctx, saga, "create-booking", "pending", "success", event)
}

type BookingCancelled struct {
	ID string
}

func (e BookingCancelled) isEvent() {}

func (ec *ExecutionCoordinator) onBookingCancelled(ctx context.Context, event BookingCancelled) (*Saga, error) {
	saga, err := ec.repo.FindSaga(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	return ec.handleEvent(ctx, &saga, "create-booking", "success", "compensated", event)
}

type PaymentCreated struct {
	ID string
}

func (e PaymentCreated) isEvent() {}

func (ec *ExecutionCoordinator) onPaymentCreated(ctx context.Context, event PaymentCreated) (*Saga, error) {
	saga, err := ec.repo.FindSaga(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	return ec.handleEvent(ctx, &saga, "create-payment", "pending", "success", event)
}

type PaymentFailed struct {
	ID string
}

func (e PaymentFailed) isEvent() {}

func (ec *ExecutionCoordinator) onPaymentFailed(ctx context.Context, event PaymentFailed) (*Saga, error) {
	saga, err := ec.repo.FindSaga(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	return ec.handleEvent(ctx, &saga, "create-payment", "pending", "failed", event)
}

type PaymentRefunded struct {
	ID string
}

func (e PaymentRefunded) isEvent() {}

func (ec *ExecutionCoordinator) onPaymentRefunded(ctx context.Context, event PaymentRefunded) (*Saga, error) {
	saga, err := ec.repo.FindSaga(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	return ec.handleEvent(ctx, &saga, "create-payment", "success", "compensated", event)
}

type BookingConfirmed struct {
	ID string
}

func (e BookingConfirmed) isEvent() {}

func (ec *ExecutionCoordinator) onBookingConfirmed(ctx context.Context, event BookingConfirmed) (*Saga, error) {
	saga, err := ec.repo.FindSaga(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	return ec.handleEvent(ctx, &saga, "confirm-booking", "pending", "success", event)
}

type BookingRejected struct {
	ID string
}

func (e BookingRejected) isEvent() {}

func (ec *ExecutionCoordinator) onBookingRejected(ctx context.Context, event BookingRejected) (*Saga, error) {
	saga, err := ec.repo.FindSaga(ctx, event.ID)
	if err != nil {
		return nil, err
	}
	return ec.handleEvent(ctx, &saga, "confirm-booking", "success", "failed", event)
}

func (ec *ExecutionCoordinator) handleEvent(ctx context.Context, saga *Saga, targetStep, fromStatus, toStatus string, evt event) (*Saga, error) {
	step, err := saga.GetStep(targetStep)
	if err != nil {
		return nil, err
	}
	if step.Status == toStatus {
		return saga, nil
	}
	if step.Status != fromStatus {
		return nil, errors.New("invalid status transition")
	}
	b, err := json.Marshal(evt)
	if err != nil {
		return nil, err
	}
	step.Status = toStatus
	step.ResponsePayload = b
	if err := saga.UpdateStep(step); err != nil {
		return nil, err
	}
	updatedSaga, err := ec.repo.UpdateSaga(ctx, saga)
	if err != nil {
		return nil, err
	}
	return &updatedSaga, nil
}

func (ec *ExecutionCoordinator) handleCommand(ctx context.Context, saga Saga, targetStep string, fromStatus, toStatus string, cmd command) (*Step, error) {
	step, err := saga.GetStep(targetStep)
	if err != nil {
		return nil, err
	}

	// The first step is triggered externally, so it
	// must always be successful.
	switch step.Status {
	case toStatus:
		return &step, nil
	case fromStatus:
		b, err := json.Marshal(cmd)
		if err != nil {
			return nil, err
		}
		step.Status = fromStatus
		step.RequestPayload = b
		if err := saga.UpdateStep(step); err != nil {
			return nil, err
		}
		_, err = ec.repo.UpdateSaga(ctx, &saga)
		if err != nil {
			return nil, err
		}
		return &step, nil
	default:
		return nil, errors.New("invalid status")
	}
}
