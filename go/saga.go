package main

import "errors"

type Saga struct {
	ID      string
	Name    string
	Version uint
	Status  string
	Steps   []Step
	Payload []byte
}

func NewBookingSaga(id string) *Saga {
	return &Saga{
		ID:      id,
		Name:    "booking-saga",
		Version: 1,
		Status:  "pending",
		Steps: []Step{
			{Name: "create-booking", Status: "pending"},
			{Name: "create-payment", Status: "pending"},
			{Name: "confirm-booking", Status: "pending"},
		},
	}
}

// CheckStatus derives the status from the children steps.
func (s *Saga) CheckStatus() string {
	for i, step := range s.Steps {
		// If any step fails, then it is compensating.
		if step.Status == "failed" {
			return "compensating"
		}

		// If the last step is a success.
		if step.Status == "success" {
			if i == len(s.Steps)-1 {
				return "done"
			}
		}
		// If the first step has been compensated.
		if step.Status == "compensated" {
			if i == 0 {
				return "done"
			}
			return "compensating"
		}
	}
	return "pending"
}

func (s *Saga) GetStep(name string) (Step, error) {
	for _, step := range s.Steps {
		if step.Name == name {
			return step, nil
		}
	}
	return Step{}, errors.New("step not found")
}

func (s *Saga) UpdateStep(step Step) error {
	for i, ss := range s.Steps {
		if ss.Name == step.Name {
			s.Steps[i] = step
			return nil
		}
	}
	return errors.New("step not found")
}
