import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RatingStatsCard } from "@/components/course/rating-stats-card";

describe("RatingStatsCard", () => {
  it("renders labels and comment count", () => {
    render(
      <RatingStatsCard
        stats={{ result: 4, grade: 3, hard: 2, reward: 5, comments: 7 }}
        labels={{ hard: "Easy", reward: "Outcome" }}
      />,
    );
    expect(screen.getByText("Overall")).toBeTruthy();
    expect(screen.getByText("Easy")).toBeTruthy();
    expect(screen.getByText("7")).toBeTruthy();
  });
});
