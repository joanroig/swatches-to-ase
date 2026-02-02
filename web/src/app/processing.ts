import { dropzone } from "./dom";
import { state } from "./state";

export const updateProcessingState = (busy: boolean) => {
  state.processing = busy;
  dropzone?.classList.toggle("is-busy", busy);
};
