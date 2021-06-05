package main

type Step struct {
	Name            string
	RequestPayload  []byte
	ResponsePayload []byte
	Status          string
}
