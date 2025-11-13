export const workflow = [
  { step: 'analyze' },
  { step: 'plan' },
  { step: 'execute', handler() {
    console.log('running');
  }
];

export function runWorkflow() {
  return workflow.map((stage) => stage.step).join(' -> ');
