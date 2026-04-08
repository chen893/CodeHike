'use client';

import type { TutorialStep } from '@/lib/schemas/tutorial-draft';

interface StepListProps {
  steps: TutorialStep[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}

export function StepList({ steps, selectedIndex, onSelect }: StepListProps) {
  return (
    <div className="step-list">
      {steps.map((step, i) => (
        <div
          key={step.id}
          className={`step-list-item${i === selectedIndex ? ' active' : ''}`}
          onClick={() => onSelect(i)}
        >
          <span className="step-num">{i + 1}</span>
          {step.title}
        </div>
      ))}
    </div>
  );
}
