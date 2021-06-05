package main

import (
	"context"
	"fmt"
	"log"
	"sync"
)

type event interface {
	isEvent()
}

type command interface {
	isCommand()
}

func main() {
	// NOTE: This is not a working example.
	evtCh := make(chan event)
	sagaCh := make(chan *Saga)
	done := make(chan struct{})

	sec := NewExecutionCoordinator(NewInMemoryStore())
	var wg sync.WaitGroup
	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-done:
				return
			case evt := <-evtCh:
				switch e := evt.(type) {
				case *BookingCreated:
					ctx := context.Background()
					saga, err := sec.onBookingCreated(ctx, *e)
					if err != nil {
						log.Printf("failed to handle event bookingCreated: %s\n", err)
						continue
					}
					sagaCh <- saga
				default:
					log.Printf("unhandled event: %s\n", e)
				}
			}
		}
	}()

	wg.Add(1)
	go func() {
		defer wg.Done()
		for {
			select {
			case <-done:
				return
			case saga := <-sagaCh:
				switch status := saga.Status; status {
				case "done":
					continue
				case "compensating":
					ctx := context.Background()
					if err := sec.CompensationFlow(ctx, *saga); err != nil {
						log.Printf("failed to handle compensation flow: %s", err)
					}
				case "pending":
					ctx := context.Background()
					if err := sec.BookingFlow(ctx, *saga); err != nil {
						log.Printf("failed to handle booking flow: %s", err)
					}
				default:
					log.Printf("unhandled status: %s\n", status)
				}

			}
		}

	}()

	evtCh <- BookingCreated{}

	wg.Wait()
	fmt.Println("completed")
}
