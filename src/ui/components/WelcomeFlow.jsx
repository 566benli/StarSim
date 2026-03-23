/**
 * First-run welcome: guided steps with illustrative figures + choice of example or scratch.
 * Figures live in assets/onboarding/*.svg (copied to dist by webpack).
 */
import React, { useState, useCallback } from 'react';
import { EXAMPLE_UNIVERSES } from '@data/exampleUniverses';
import { ONBOARDING_DONE_KEY } from '@utils/onboardingKeys';
import './WelcomeFlow.css';

/** Paths are relative to index.html (Electron file:// and dev server). */
const ONB = (name) => `./assets/onboarding/${name}`;

const STEPS = [
  {
    title: 'Welcome to StarSim',
    body: 'You’ll build and evolve your own space of stars, planets, and compact objects. This short tour covers the essentials — you can skip anytime.',
    image: ONB('onb-0-welcome.svg'),
    imageAlt: 'Illustration: star, planets, and orbit curve in space',
  },
  {
    title: 'Your first object',
    body: 'On the next screen, add exactly one body — a star, planet, black hole, or other preset. After you launch, use the Objects bar at the top to drag in more stars and planets; drop on the canvas to set distance and angle from existing bodies.',
    image: ONB('onb-1-first-object.svg'),
    imageAlt: 'Illustration: object palette and Launch button',
  },
  {
    title: 'Views: Universe → System → Body',
    body: 'Use the breadcrumb (Universe / System / Body) to change scale. Universe shows galaxies; System shows orbits in AU; Body zooms on one object. The minimap and Universe panel also help you jump around.',
    image: ONB('onb-2-views.svg'),
    imageAlt: 'Illustration: breadcrumb navigation and system view',
  },
  {
    title: 'Time evolution',
    body: 'The bottom bar runs the simulation: play/pause, speed presets, and a slider (including warp for very fast forward). Simulation time advances in years while you watch orbits evolve.',
    image: ONB('onb-3-time.svg'),
    imageAlt: 'Illustration: time control bar',
  },
  {
    title: 'Information panel & orbit trails',
    body: 'In System or Body view, click any star or planet to open its information panel (properties, neighbors, 🎯 Focus). Bright curved trails behind moving bodies show recent orbital paths — like sandbox-style orbit visualization.',
    image: ONB('onb-4-click-trails.svg'),
    imageAlt: 'Illustration: orbit trails and info panel',
  },
  {
    title: 'Saving & loading',
    body: 'Use the toolbar save icon or Ctrl+S for slots: save, load, or delete worlds. From the menu you can also load autos or cloud saves if enabled.',
    image: ONB('onb-5-save.svg'),
    imageAlt: 'Illustration: save slots',
  },
  {
    title: 'You’re ready',
    body: 'Next, pick a starter scene to explore, or build entirely from scratch. You can replay this tour from the setup screen anytime.',
    image: ONB('onb-6-ready.svg'),
    imageAlt: 'Illustration: example vs scratch choice',
  },
];

export default function WelcomeFlow({ onChooseScratch, onChooseExample }) {
  const [phase, setPhase] = useState('steps');
  const [stepIndex, setStepIndex] = useState(0);

  const goNext = useCallback(() => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((i) => i + 1);
    } else {
      setPhase('choice');
    }
  }, [stepIndex]);

  const goBack = useCallback(() => {
    if (stepIndex > 0) setStepIndex((i) => i - 1);
  }, [stepIndex]);

  const skipToChoice = useCallback(() => {
    setPhase('choice');
  }, []);

  const finishScratch = useCallback(() => {
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch (_) {}
    onChooseScratch?.();
  }, [onChooseScratch]);

  const finishExample = useCallback((seedFn) => {
    try {
      localStorage.setItem(ONBOARDING_DONE_KEY, '1');
    } catch (_) {}
    onChooseExample?.(seedFn);
  }, [onChooseExample]);

  if (phase === 'choice') {
    return (
      <div className="welcome-flow-overlay" role="dialog" aria-labelledby="welcome-choice-title">
        <div className="welcome-flow-card welcome-choice-card">
          <h2 id="welcome-choice-title">How would you like to start?</h2>
          <p className="welcome-flow-lead">
            Try a ready-made system you can modify, or create your own universe from a blank slate.
          </p>
          <div className="welcome-example-grid">
            {EXAMPLE_UNIVERSES.map((ex) => (
              <button
                key={ex.id}
                type="button"
                className="welcome-example-btn"
                onClick={() => finishExample(ex.seed)}
              >
                <span className="welcome-example-title">{ex.title}</span>
                <span className="welcome-example-blurb">{ex.blurb}</span>
              </button>
            ))}
          </div>
          <button type="button" className="welcome-scratch-btn" onClick={finishScratch}>
            Create my own from scratch
          </button>
        </div>
      </div>
    );
  }

  const step = STEPS[stepIndex];
  return (
    <div className="welcome-flow-overlay" role="dialog" aria-labelledby="welcome-step-title">
      <div className="welcome-flow-card welcome-flow-card-with-figure">
        <div className="welcome-flow-progress">
          {STEPS.map((_, i) => (
            <span key={i} className={`welcome-dot ${i <= stepIndex ? 'active' : ''}`} />
          ))}
        </div>
        <div className="welcome-flow-figure-row">
          <figure className="welcome-flow-figure">
            <img src={step.image} alt={step.imageAlt} loading="lazy" decoding="async" />
          </figure>
          <div className="welcome-flow-copy">
            <h2 id="welcome-step-title">{step.title}</h2>
            <p className="welcome-flow-body">{step.body}</p>
          </div>
        </div>
        <div className="welcome-flow-actions">
          <button type="button" className="welcome-btn secondary" onClick={skipToChoice}>
            Skip tour
          </button>
          <div className="welcome-flow-nav">
            <button
              type="button"
              className="welcome-btn secondary"
              onClick={goBack}
              disabled={stepIndex === 0}
            >
              Back
            </button>
            <button type="button" className="welcome-btn primary" onClick={goNext}>
              {stepIndex === STEPS.length - 1 ? 'Continue' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
