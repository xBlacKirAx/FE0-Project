export function createTutorialEngine(state, cardOps) {
    const { ref } = Vue;
    const steps = ref([]);
    const activeStepIndex = ref(-1);
    const panelOpen = ref(false);
    const tutorialTitle = ref('');
    const roomTutorialId = ref('');
    const doneStepIds = new Set();

    const resetTutorial = () => {
        steps.value = [];
        activeStepIndex.value = -1;
        panelOpen.value = false;
        tutorialTitle.value = '';
        roomTutorialId.value = '';
        doneStepIds.clear();
    };

    const currentStep = () => {
        if (activeStepIndex.value < 0) return null;
        return steps.value[activeStepIndex.value] || null;
    };

    const openStep = (index) => {
        if (index < 0 || index >= steps.value.length) return false;
        activeStepIndex.value = index;
        panelOpen.value = true;
        const stepId = String(steps.value[index]?.id || '').trim();
        if (stepId) doneStepIds.add(stepId);
        return true;
    };

    const isManualCatchAllCandidate = (step) => {
        if (String(step?.trigger?.type || '').trim() !== 'manual') return false;
        if (step.excludeFromManualScan === true) return false;
        return true;
    };

    const triggerFirstMatchingStep = (predicate) => {
        for (let i = 0; i < steps.value.length; i++) {
            const step = steps.value[i] || {};
            const stepId = String(step.id || '').trim();
            if (stepId && doneStepIds.has(stepId)) continue;
            if (!predicate(step)) continue;
            return openStep(i);
        }
        return false;
    };

    const onInit = (payload = {}) => {
        roomTutorialId.value = String(payload.tutorialId || '').trim();
        tutorialTitle.value = String(payload.title || roomTutorialId.value || '教学关').trim();
        steps.value = Array.isArray(payload.steps) ? payload.steps : [];
        activeStepIndex.value = -1;
        doneStepIds.clear();

        cardOps.applyTutorialSnapshot(payload.snapshot || {});

        state.currentPhase.value = 'BEGINNING';
        state.isDevMode.value = false;
        state.isMyTurn.value = true;
        if (state.firstPlayerOpeningTurnLocked) {
            state.firstPlayerOpeningTurnLocked.value = false;
        }

        triggerFirstMatchingStep((step) => String(step?.trigger?.type || '').trim() === 'onInit');
    };

    const goNextManualStep = () => {
        const current = activeStepIndex.value >= 0 ? steps.value[activeStepIndex.value] : null;
        const nextId = String(current?.nextStepId || '').trim();
        if (nextId) {
            const idx = steps.value.findIndex((s) => String(s?.id || '').trim() === nextId);
            if (idx >= 0) return openStep(idx);
        }
        if (activeStepIndex.value >= 0 && activeStepIndex.value < steps.value.length - 1) {
            const currentType = String(current?.trigger?.type || '').trim();
            if (currentType === 'manual') {
                return openStep(activeStepIndex.value + 1);
            }
        }
        return triggerFirstMatchingStep(isManualCatchAllCandidate);
    };

    const onPhaseChanged = (phase) => {
        const normalizedPhase = String(phase || '').trim();
        if (!normalizedPhase) return;
        triggerFirstMatchingStep((step) =>
            String(step?.trigger?.type || '').trim() === 'phase'
            && String(step?.trigger?.phase || '').trim() === normalizedPhase
        );
    };

    const closePanel = () => {
        panelOpen.value = false;
    };

    return {
        steps,
        panelOpen,
        tutorialTitle,
        roomTutorialId,
        activeStepIndex,
        currentStep,
        resetTutorial,
        onInit,
        onPhaseChanged,
        closePanel,
        goNextManualStep
    };
}
