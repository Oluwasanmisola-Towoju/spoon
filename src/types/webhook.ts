// what every queue usees for each verified webhook from GH
export interface WebhookJob {
    deliveryId: string;   // GH unique Id for this delivery
    event: string;       // fork, pr or ping
    payload: unknown;   // unknown since it comes from outside the system
}