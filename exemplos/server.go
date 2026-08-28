// Exemplo de código Go
package main

import (
	"encoding/json"
	"fmt"
	"net/http"
)

type Response struct {
	Status  string `json:"status"`
	Message string `json:"message"`
	Code    int    `json:"code"`
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	resp := Response{
		Status:  "success",
		Message: "MarkiiDown Universal Server",
		Code:    http.StatusOK,
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func main() {
	http.HandleFunc("/health", handleHealth)
	fmt.Println("Servidor rodando na porta :8080")
	http.ListenAndServe(":8080", nil)
}
