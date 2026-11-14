using System.Text.Json.Nodes;

namespace LGSApp.Infrastructure.Services.Ai;

public static class AiSchemas
{
    public static readonly string[] Letters = ["A", "B", "C", "D"];
    public static readonly string[] Confidences = ["high", "medium", "low"];

    public static JsonNode Question() => JsonNode.Parse(
        """
        {
          "type": "object",
          "properties": {
            "question": { "type": "string" },
            "optionA": { "type": "string" },
            "optionB": { "type": "string" },
            "optionC": { "type": "string" },
            "optionD": { "type": "string" },
            "correctOption": { "type": "string", "enum": ["A", "B", "C", "D"] },
            "explanation": { "type": "string" },
            "topic": { "type": "string" }
          },
          "required": ["question", "optionA", "optionB", "optionC", "optionD", "correctOption", "explanation", "topic"],
          "additionalProperties": false
        }
        """)!;

    public static JsonNode BlindSolution() => JsonNode.Parse(
        """
        {
          "type": "object",
          "properties": {
            "readable": { "type": "boolean" },
            "answer": { "type": "string", "enum": ["A", "B", "C", "D", "NONE"] },
            "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
            "solution": { "type": "string" }
          },
          "required": ["readable", "answer", "confidence", "solution"],
          "additionalProperties": false
        }
        """)!;

    public static JsonNode VerifiedSolution() => JsonNode.Parse(
        """
        {
          "type": "object",
          "properties": {
            "readable": { "type": "boolean" },
            "agreesWithKey": { "type": "boolean" },
            "answer": { "type": "string", "enum": ["A", "B", "C", "D", "NONE"] },
            "confidence": { "type": "string", "enum": ["high", "medium", "low"] },
            "solution": { "type": "string" }
          },
          "required": ["readable", "agreesWithKey", "answer", "confidence", "solution"],
          "additionalProperties": false
        }
        """)!;
}
