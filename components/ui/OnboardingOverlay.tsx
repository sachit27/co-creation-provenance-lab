import React, { useState, useEffect } from 'react';

/**
 * Guided Onboarding Overlay
 *
 * A step-by-step tutorial that appears on first launch.
 * Stored in localStorage so it only shows once.
 */

const ONBOARDING_KEY = 'provenance-lab-onboarding-seen';

const steps = [
    {
        emoji: '🌍',
        title: 'Welcome to the Co-Creation Provenance Lab',
        body: 'This tool audits AI-generated summaries to make the invisible visible — showing whose voice was captured, whose was lost, and what opportunities were missed.',
    },
    {
        emoji: '📄',
        title: 'Step 1: Upload Your Data',
        body: 'Upload a CSV file with participant responses. The tool auto-detects columns (ID, text, group), handles files with or without headers, and cleans the data for you. You can also try the built-in sample datasets to see the tool in action.',
    },
    {
        emoji: '🤖',
        title: 'Step 2: AI Generates a Summary',
        body: 'Choose an AI-generated, extractive, or external/manual summary. Generation, automated evaluator, and embedding roles are shown separately; available methods depend on the verified provider and local services.',
    },
    {
        emoji: '🔬',
        title: 'Step 3: The Provenance Audit',
        body: 'The system computes strongest sentence-level semantic alignment for each valid source record, then exposes distributions, review candidates, and model-coded evidence checks. These indicators are not a fairness verdict.',
    },
    {
        emoji: '🎯',
        title: 'Step 4: Act on the Insights',
        body: 'Review sentence–source similarity candidates, exact-span transformation evidence, claim support, tension handling, and knowledge graphs. Similarity does not prove that a source caused or shaped a sentence.',
    },
];

interface OnboardingOverlayProps {
    onDismiss?: () => void;
}

export const OnboardingOverlay: React.FC<OnboardingOverlayProps> = ({ onDismiss }) => {
    const [visible, setVisible] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
        const seen = localStorage.getItem(ONBOARDING_KEY);
        if (!seen) {
            setVisible(true);
        }
    }, []);

    const handleDismiss = () => {
        localStorage.setItem(ONBOARDING_KEY, 'true');
        setVisible(false);
        onDismiss?.();
    };

    const handleNext = () => {
        if (currentStep < steps.length - 1) {
            setCurrentStep(currentStep + 1);
        } else {
            handleDismiss();
        }
    };

    if (!visible) return null;

    const step = steps[currentStep];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
                {/* Progress bar */}
                <div className="h-1 bg-slate-100">
                    <div
                        className="h-full bg-blue-500 transition-all duration-300"
                        style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                    />
                </div>

                {/* Content — key triggers fade animation on step change */}
                <div key={currentStep} className="p-8 text-center animate-fadeIn">
                    {currentStep === 0 ? (
                      <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-16 w-16 mx-auto mb-4 rounded-xl" />
                    ) : (
                      <div className="text-5xl mb-4">{step.emoji}</div>
                    )}
                    <h2 className="text-xl font-bold text-slate-800 mb-3">{step.title}</h2>
                    <p className="text-slate-600 text-sm leading-relaxed max-w-md mx-auto">{step.body}</p>
                </div>

                {/* Navigation */}
                <div className="px-8 pb-6 flex items-center justify-between">
                    <button
                        onClick={handleDismiss}
                        className="text-sm text-slate-400 hover:text-slate-600 transition-colors"
                    >
                        Skip tutorial
                    </button>
                    <div className="flex items-center gap-3">
                        {/* Step dots */}
                        <div className="flex gap-1.5">
                            {steps.map((_, i) => (
                                <div
                                    key={i}
                                    className={`w-2 h-2 rounded-full transition-colors ${i === currentStep ? 'bg-blue-500' : i < currentStep ? 'bg-blue-200' : 'bg-slate-200'
                                        }`}
                                />
                            ))}
                        </div>
                        <button
                            onClick={handleNext}
                            className="bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2.5 px-6 rounded-lg transition-colors"
                        >
                            {currentStep < steps.length - 1 ? 'Next →' : 'Get Started →'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
