import { useMutation } from "@tanstack/react-query";
import type { Approval } from "@paperclipai/shared";
import { approvalsApi } from "../host/api";
import { useToastActions } from "../host/shims";

/**
 * Approve / reject an approval with the shared error toasts. Used by the
 * pane's approval row and the queue's approval item so the two never drift
 * on what a failed decision looks like.
 */
export function useApprovalDecision(approval: Approval, onActed: () => void) {
  const { pushToast } = useToastActions();
  const approve = useMutation({
    mutationFn: (note?: string) => approvalsApi.approve(approval.id, note?.trim() ? note.trim() : undefined),
    onSuccess: onActed,
    onError: (mutationError) => {
      pushToast({
        title: "Approval failed",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });
  const reject = useMutation({
    mutationFn: (note?: string) => approvalsApi.reject(approval.id, note?.trim() ? note.trim() : undefined),
    onSuccess: onActed,
    onError: (mutationError) => {
      pushToast({
        title: "Rejection failed",
        body: mutationError instanceof Error ? mutationError.message : "Please try again.",
        tone: "error",
      });
    },
  });
  return {
    approve: (note?: string) => approve.mutate(note),
    reject: (note?: string) => reject.mutate(note),
    busy: approve.isPending || reject.isPending,
  };
}
