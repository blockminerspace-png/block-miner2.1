import { describe, it, expect } from "vitest";
import en from "./locales/en.json";
import pt from "./locales/pt-BR.json";
import es from "./locales/es.json";

describe("locale bundles (pt-BR / es parity)", () => {
  it("exposes wallet deposit options, games label, check-in errors, and turbo iframe title", () => {
    expect(en.wallet.deposit_options.smart_contract).toBeTruthy();
    expect(pt.wallet.deposit_options.smart_contract).toBeTruthy();
    expect(es.wallet.deposit_options.smart_contract).toBeTruthy();

    expect(en.games.temporary_power_label).toBeTruthy();
    expect(pt.games.temporary_power_label).toBeTruthy();
    expect(es.games.temporary_power_label).toBeTruthy();

    expect(en.minerGames.hash_score_label).toBeTruthy();
    expect(pt.minerGames.hash_score_label).toBeTruthy();
    expect(es.minerGames.hash_score_label).toBeTruthy();

    expect(en.minerGames.socket_errors.invalid_session).toBeTruthy();
    expect(pt.minerGames.socket_errors.invalid_session).toBeTruthy();
    expect(es.minerGames.socket_errors.invalid_session).toBeTruthy();

    expect(en.minerGames.socket_errors.session_active).toBeTruthy();
    expect(pt.minerGames.socket_errors.session_active).toBeTruthy();
    expect(es.minerGames.socket_errors.session_active).toBeTruthy();

    expect(en.minerGames.game_reward.full_term).toContain("{{days}}");
    expect(pt.minerGames.game_reward.full_term).toContain("{{days}}");
    expect(es.minerGames.game_reward.full_term).toContain("{{days}}");

    expect(en.checkin.error_balance_insufficient).toBeTruthy();
    expect(pt.checkin.error_balance_insufficient).toBeTruthy();
    expect(es.checkin.error_balance_insufficient).toBeTruthy();

    expect(en.checkin.payment_method_heading).toBeTruthy();
    expect(pt.checkin.payment_tab_wallet).toBeTruthy();
    expect(es.checkin.cta_wallet_payment).toBeTruthy();

    expect(en.checkin.wallet_pay_line).toBeTruthy();
    expect(pt.checkin.cta_wallet_line1).toBeTruthy();
    expect(es.checkin.cta_wallet_line2).toBeTruthy();
    expect(es.checkin.view_on_polygonscan).toBeTruthy();

    expect(en.checkin.errors.PAYMENT_REQUIRED).toBeTruthy();
    expect(pt.checkin.errors.TRANSACTION_NOT_CONFIRMED).toBeTruthy();
    expect(es.checkin.errors.TRANSACTION_ALREADY_USED).toBeTruthy();
    expect(en.checkin.errors.CHECKIN_RECEIVER_NOT_CONFIGURED).toBeTruthy();
    expect(pt.checkin.errors.CHECKIN_RECEIVER_NOT_CONFIGURED).toBeTruthy();
    expect(es.checkin.errors.CHECKIN_RECEIVER_NOT_CONFIGURED).toBeTruthy();
    expect(en.checkin.errors.CHECKIN_PENDING_PAYMENT).toBeTruthy();
    expect(en.checkin.free_claim_ok).toBeTruthy();
    expect(pt.checkin.claim_free_daily).toBeTruthy();

    expect(en.checkin.daily_pay_hint).toBeTruthy();
    expect(pt.checkin.daily_pay_hint).toBeTruthy();
    expect(es.checkin.daily_pay_hint).toBeTruthy();

    expect(en.checkin.milestones.reward.pol.title).toContain('{{day}}');
    expect(pt.checkin.milestones.reward.pol.title).toContain('{{day}}');
    expect(es.checkin.milestones.reward.machine.title).toContain('{{day}}');
    expect(pt.checkin.milestones.status.unlockedNextCheckin).toBeTruthy();
    expect(en.checkin.milestones.status.blocked).toBe('Blocked');
    expect(en.checkin.anti_bot_note).toBeTruthy();
    expect(pt.checkin.anti_bot_note).toBeTruthy();
    expect(es.checkin.anti_bot_note).toBeTruthy();

    expect(en.checkin.wallet_unavailable_use_balance).toBeTruthy();
    expect(pt.checkin.wallet_unavailable_use_balance).toBeTruthy();
    expect(es.checkin.wallet_unavailable_use_balance).toBeTruthy();
    expect(en.checkin.balance_pay_line).toBeTruthy();
    expect(pt.checkin.balance_pay_line).toBeTruthy();
    expect(es.checkin.balance_pay_line).toBeTruthy();
    expect(en.checkin.errors.INSUFFICIENT_BALANCE).toBeTruthy();
    expect(pt.checkin.errors.INSUFFICIENT_BALANCE).toBeTruthy();
    expect(es.checkin.errors.INSUFFICIENT_BALANCE).toBeTruthy();
    expect(en.checkin.errors.CHECKIN_BUSY).toBeTruthy();
    expect(pt.checkin.errors.CHECKIN_BUSY).toBeTruthy();
    expect(es.checkin.errors.CHECKIN_BUSY).toBeTruthy();

    expect(en.adminAuth.session_invalid).toBeTruthy();
    expect(pt.adminAuth.session_banner).toBeTruthy();
    expect(es.adminAuth.auth_not_configured).toBeTruthy();
    expect(en.adminAuth.submit).toBeTruthy();
    expect(es.adminMiniPass.workflow_hint).toBeTruthy();
    expect(en.adminMiniPass.list.title).toBeTruthy();
    expect(pt.adminMiniPass.list.title).toBeTruthy();
    expect(es.adminMiniPass.list.title).toBeTruthy();
    expect(en.adminMiniPass.sections.pass).toBeTruthy();
    expect(pt.adminMiniPass.sections.pass).toBeTruthy();
    expect(es.adminMiniPass.sections.pass).toBeTruthy();

    expect(en.adminBackups.title).toBeTruthy();
    expect(pt.adminBackups.title).toBeTruthy();
    expect(es.adminBackups.title).toBeTruthy();
    expect(en.adminBackups.status_success).toBeTruthy();
    expect(en.adminBackups.subtitle_full_copy).toBeTruthy();
    expect(pt.adminBackups.subtitle_full_copy).toBeTruthy();
    expect(es.adminBackups.subtitle_full_copy).toBeTruthy();

    expect(en.adminLogs.title).toBeTruthy();
    expect(pt.adminLogs.title).toBeTruthy();
    expect(es.adminLogs.title).toBeTruthy();
    expect(en.adminLogs.filter_category).toBeTruthy();
    expect(en.transparency.admin.wallet_section_title).toBeTruthy();
    expect(en.admin_user_sidebar.search_placeholder).toBeTruthy();
    expect(es.admin_user_sidebar.normalize).toBeTruthy();
    expect(pt.transparency.admin.wallet_save).toBeTruthy();
    expect(pt.adminLogs.category_auth).toBeTruthy();
    expect(es.adminLogs.source_all).toBeTruthy();

    expect(en.wallet.hero_subtitle).toBeTruthy();
    expect(pt.wallet.ledger_title).toBeTruthy();
    expect(es.wallet.tx_inflow).toBeTruthy();

    expect(en.autoMiningGpuPage.turbo_zerads_iframe_title).toBeTruthy();
    expect(pt.autoMiningGpuPage.turbo_zerads_iframe_title).toBeTruthy();
    expect(es.autoMiningGpuPage.turbo_zerads_iframe_title).toBeTruthy();

    expect(en.wallet.web3_deposit.disconnect_to_switch).toBeTruthy();
    expect(pt.wallet.web3_deposit.hint_disconnect_for_contract).toBeTruthy();
    expect(es.wallet.web3_deposit.hint_disconnect_for_wc).toBeTruthy();
  });

  it("exposes Read & Earn strings in en, pt-BR, and es", () => {
    expect(en.readEarn.title).toBeTruthy();
    expect(pt.readEarn.title).toBeTruthy();
    expect(es.readEarn.title).toBeTruthy();
    expect(en.adminReadEarn.title).toBeTruthy();
    expect(pt.adminReadEarn.title).toBeTruthy();
    expect(es.adminReadEarn.title).toBeTruthy();
    expect(en.sidebar.read_earn).toBeTruthy();
    expect(pt.sidebar.read_earn).toBeTruthy();
    expect(es.sidebar.read_earn).toBeTruthy();
  });

  it("exposes sidebar manual, roadmap, and transparency labels in en, pt-BR, and es", () => {
    expect(en.sidebar.manual).toBeTruthy();
    expect(pt.sidebar.manual).toBeTruthy();
    expect(es.sidebar.manual).toBeTruthy();
    expect(en.sidebar.roadmap).toBeTruthy();
    expect(pt.sidebar.roadmap).toBeTruthy();
    expect(es.sidebar.roadmap).toBeTruthy();
    expect(en.sidebar.transparency).toBeTruthy();
    expect(pt.sidebar.transparency).toBeTruthy();
    expect(es.sidebar.transparency).toBeTruthy();
  });

  it("exposes daily tasks and sidebar link in en, pt-BR, and es", () => {
    expect(en.dailyTasks.title).toBeTruthy();
    expect(pt.dailyTasks.title).toBeTruthy();
    expect(es.dailyTasks.title).toBeTruthy();
    expect(en.dailyTasks.load_error_body).toBeTruthy();
    expect(pt.dailyTasks.load_error_body).toBeTruthy();
    expect(es.dailyTasks.load_error_body).toBeTruthy();
    expect(en.dailyTasks.retry).toBeTruthy();
    expect(pt.dailyTasks.retry).toBeTruthy();
    expect(es.dailyTasks.retry).toBeTruthy();
    expect(en.dailyTasks.errors.unauthorized).toBeTruthy();
    expect(pt.dailyTasks.errors.unauthorized).toBeTruthy();
    expect(es.dailyTasks.errors.unauthorized).toBeTruthy();
    expect(en.dailyTasks.errors.server).toBeTruthy();
    expect(pt.dailyTasks.errors.server).toBeTruthy();
    expect(es.dailyTasks.errors.server).toBeTruthy();
    expect(en.dailyTasks.cadence.DAILY).toBeTruthy();
    expect(en.dailyTasks.period).toBeTruthy();
    expect(en.dailyTasks.earliest_reset).toBeTruthy();
    expect(en.dailyTasks.nav_aria).toBeTruthy();
    expect(en.dailyTasks.section_DAILY).toBeTruthy();
    expect(pt.dailyTasks.jump_WEEKLY).toBeTruthy();
    expect(es.dailyTasks.section_MONTHLY).toBeTruthy();
    expect(en.admin_daily_tasks.quick_start).toBeTruthy();
    expect(pt.admin_daily_tasks.tpl_checkins).toBeTruthy();
    expect(es.admin_daily_tasks.target_hint_default).toBeTruthy();
    expect(en.admin_daily_tasks.create_target_count).toBeTruthy();
    expect(pt.admin_daily_tasks.create_offerwall_period_tip).toBeTruthy();
    expect(es.admin_daily_tasks.create_error_target_count).toBeTruthy();
    expect(en.admin_daily_tasks.load_failed_body).toBeTruthy();
    expect(en.admin_daily_tasks.retry).toBeTruthy();
    expect(en.admin_daily_tasks.error_network).toBeTruthy();
    expect(pt.admin_daily_tasks.load_failed_body).toBeTruthy();
    expect(es.admin_daily_tasks.load_failed_body).toBeTruthy();
    expect(en.sidebar.rewards).toBeTruthy();
    expect(pt.sidebar.rewards).toBeTruthy();
    expect(es.sidebar.rewards).toBeTruthy();
    expect(en.sidebar.daily_tasks).toBeTruthy();
    expect(pt.sidebar.daily_tasks).toBeTruthy();
    expect(es.sidebar.daily_tasks).toBeTruthy();
    expect(en.dailyTasks.tasks.mine_blk).toContain("{{target}}");
    expect(pt.dailyTasks.tasks.mine_blk).toContain("{{target}}");
    expect(es.dailyTasks.tasks.mine_blk).toContain("{{target}}");
  });

  it("exposes internal offerwall page and admin nav labels in en, pt-BR, and es", () => {
    expect(en.internalOfferwallPage.title).toBeTruthy();
    expect(pt.internalOfferwallPage.title).toBeTruthy();
    expect(es.internalOfferwallPage.title).toBeTruthy();
    expect(en.internalOfferwallPage.empty).toBeTruthy();
    expect(pt.internalOfferwallPage.empty).toBeTruthy();
    expect(es.internalOfferwallPage.empty).toBeTruthy();
    expect(en.internalOfferwallPage.open_partner_new_window).toBeTruthy();
    expect(en.internalOfferwallPage.back_to_offerwall).toBeTruthy();
    expect(pt.internalOfferwallPage.exit_task_confirm_body).toBeTruthy();
    expect(es.internalOfferwallPage.abandon_ok).toBeTruthy();
    expect(pt.internalOfferwallPage.ptc_new_window_hint).toBeTruthy();
    expect(es.internalOfferwallPage.popup_blocked).toBeTruthy();
    expect(en.internalOfferwallPage.partner_not_opened).toBeTruthy();
    expect(pt.internalOfferwallPage.partner_not_opened).toBeTruthy();
    expect(es.internalOfferwallPage.partner_not_opened).toBeTruthy();
    expect(en.internalOfferwallPage.submit_reward_config_error).toBeTruthy();
    expect(pt.internalOfferwallPage.submit_reward_config_error).toBeTruthy();
    expect(es.internalOfferwallPage.submit_reward_config_error).toBeTruthy();
    expect(en.internalOfferwallPage.countdown_title).toBeTruthy();
    expect(pt.internalOfferwallPage.countdown_ready).toBeTruthy();
    expect(es.internalOfferwallPage.countdown_unit).toBeTruthy();
    expect(en.internalOfferwallPage.usage_progress).toContain("{{completed}}");
    expect(pt.internalOfferwallPage.available_in).toContain("{{time}}");
    expect(es.internalOfferwallPage.errors.task_limit_reached).toContain("{{time}}");
    expect(en.admin_internal_offerwall.form_max_executions).toBeTruthy();
    expect(pt.admin_internal_offerwall.form_reset_type).toBeTruthy();
    expect(es.admin_internal_offerwall.validation_cooldown_range).toBeTruthy();
    expect(en.admin_internal_offerwall.nav).toBeTruthy();
    expect(pt.admin_internal_offerwall.nav).toBeTruthy();
    expect(es.admin_internal_offerwall.nav).toBeTruthy();
    expect(en.admin_internal_offerwall.validation_iframe_required).toBeTruthy();
    expect(pt.admin_internal_offerwall.validation_iframe_required).toBeTruthy();
    expect(es.admin_internal_offerwall.validation_iframe_required).toBeTruthy();
    expect(en.admin_internal_offerwall.error_iframe_not_allowed).toContain("{{host}}");
    expect(pt.admin_internal_offerwall.error_iframe_not_allowed).toContain("{{host}}");
    expect(es.admin_internal_offerwall.error_iframe_not_allowed).toContain("{{host}}");
    expect(en.admin_internal_offerwall.error_iframe_host_invalid).toBeTruthy();
    expect(pt.admin_internal_offerwall.error_iframe_host_invalid).toBeTruthy();
    expect(es.admin_internal_offerwall.error_iframe_host_invalid).toBeTruthy();
    expect(en.adminSidebar.nav.internal_offerwall).toBeTruthy();
    expect(pt.adminSidebar.nav.internal_offerwall).toBeTruthy();
    expect(es.adminSidebar.nav.internal_offerwall).toBeTruthy();
    expect(en.adminLayout.title).toBeTruthy();
    expect(pt.adminLayout.title).toBeTruthy();
    expect(es.adminLayout.title).toBeTruthy();
    expect(en.adminLayout.open_menu).toBeTruthy();
    expect(pt.adminLayout.open_menu).toBeTruthy();
    expect(es.adminLayout.open_menu).toBeTruthy();
    expect(en.dailyTasks.tasks.internal_offerwall).toContain("{{target}}");
    expect(pt.dailyTasks.tasks.internal_offerwall).toContain("{{target}}");
    expect(es.dailyTasks.tasks.internal_offerwall).toContain("{{target}}");
    expect(en.admin_daily_tasks.type_INTERNAL_OFFERWALL).toBeTruthy();
    expect(pt.admin_daily_tasks.type_INTERNAL_OFFERWALL).toBeTruthy();
    expect(es.admin_daily_tasks.type_INTERNAL_OFFERWALL).toBeTruthy();
  });

  it("exposes admin daily tasks page strings and nav label in en, pt-BR, and es", () => {
    expect(en.admin_daily_tasks.title).toBeTruthy();
    expect(pt.admin_daily_tasks.title).toBeTruthy();
    expect(es.admin_daily_tasks.title).toBeTruthy();
    expect(en.admin_daily_tasks.col_save_order).toBeTruthy();
    expect(pt.admin_daily_tasks.col_save_order).toBeTruthy();
    expect(es.admin_daily_tasks.col_save_order).toBeTruthy();
    expect(en.admin_daily_tasks.col_delete).toBeTruthy();
    expect(pt.admin_daily_tasks.col_delete).toBeTruthy();
    expect(es.admin_daily_tasks.col_delete).toBeTruthy();
    expect(en.admin_daily_tasks.crud_hint).toBeTruthy();
    expect(pt.admin_daily_tasks.crud_hint).toBeTruthy();
    expect(es.admin_daily_tasks.crud_hint).toBeTruthy();
    expect(en.admin_daily_tasks.cadence_select_aria).toBeTruthy();
    expect(pt.admin_daily_tasks.cadence_select_aria).toBeTruthy();
    expect(es.admin_daily_tasks.cadence_select_aria).toBeTruthy();
    expect(en.admin_daily_tasks.create_task).toBeTruthy();
    expect(en.admin_daily_tasks.delete_task).toBeTruthy();
    expect(en.sidebar.settings).toBeTruthy();
    expect(pt.sidebar.settings).toBeTruthy();
    expect(es.sidebar.settings).toBeTruthy();
    expect(en.liveServer.title).toBeTruthy();
    expect(pt.liveServer.title).toBeTruthy();
    expect(es.liveServer.title).toBeTruthy();
    expect(en.feature_gate.unavailable).toBeTruthy();
    expect(pt.feature_gate.unavailable).toBeTruthy();
    expect(es.feature_gate.unavailable).toBeTruthy();
    expect(en.adminSidebar.nav.daily_tasks).toBeTruthy();
    expect(pt.adminSidebar.nav.daily_tasks).toBeTruthy();
    expect(es.adminSidebar.nav.daily_tasks).toBeTruthy();
  });

  it("exposes inventory rack modal warehouse action strings in en, pt-BR, and es", () => {
    expect(en.inventory.modal.move_to_warehouse).toBeTruthy();
    expect(pt.inventory.modal.move_to_warehouse).toBeTruthy();
    expect(es.inventory.modal.move_to_warehouse).toBeTruthy();
    expect(en.inventory.modal.remove_options_intro).toBeTruthy();
    expect(pt.inventory.modal.remove_options_intro).toBeTruthy();
    expect(es.inventory.modal.remove_options_intro).toBeTruthy();
  });

  it("exposes support tickets and admin support strings in en, pt-BR, and es", () => {
    expect(en.sidebar.support).toBeTruthy();
    expect(pt.sidebar.support).toBeTruthy();
    expect(es.sidebar.support).toBeTruthy();

    expect(en.support_tickets.title).toBeTruthy();
    expect(pt.support_tickets.title).toBeTruthy();
    expect(es.support_tickets.title).toBeTruthy();

    expect(en.admin_support.title).toBeTruthy();
    expect(pt.admin_support.title).toBeTruthy();
    expect(es.admin_support.title).toBeTruthy();

    expect(en.admin_support.dossier.section_title).toBeTruthy();
    expect(pt.admin_support.dossier.section_title).toBeTruthy();
    expect(es.admin_support.dossier.section_title).toBeTruthy();

    expect(en.admin_support.dossier.miners_inventory).toBeTruthy();
    expect(pt.admin_support.dossier.miners_vault).toBeTruthy();
    expect(es.admin_support.dossier.miners_rack).toBeTruthy();

    expect(en.admin_support.reply_compose_expand).toBeTruthy();
    expect(pt.admin_support.reply_compose_expand).toBeTruthy();
    expect(es.admin_support.reply_compose_expand).toBeTruthy();
    expect(en.admin_support.reply_compose_collapse).toBeTruthy();
    expect(pt.admin_support.reply_compose_collapse).toBeTruthy();
    expect(es.admin_support.reply_compose_collapse).toBeTruthy();
  });

  it("exposes inventory backpack → warehouse strings in en, pt-BR, and es", () => {
    expect(en.inventory.backpack_send_warehouse).toBeTruthy();
    expect(pt.inventory.backpack_send_warehouse).toBeTruthy();
    expect(es.inventory.backpack_send_warehouse).toBeTruthy();
    expect(en.inventory.backpack_qty_hint).toContain("{{count}}");
    expect(pt.inventory.backpack_qty_hint).toContain("{{count}}");
    expect(es.inventory.backpack_qty_hint).toContain("{{count}}");
  });

  it("exposes Chain 2048 game strings in en, pt-BR, and es", () => {
    expect(en.game2048.title).toBeTruthy();
    expect(pt.game2048.title).toBeTruthy();
    expect(es.game2048.title).toBeTruthy();
    expect(en.game2048.errors.COOLDOWN_ACTIVE).toBeTruthy();
    expect(pt.game2048.errors.COOLDOWN_ACTIVE).toBeTruthy();
    expect(es.game2048.errors.COOLDOWN_ACTIVE).toBeTruthy();
    expect(en.game2048.errors.SESSION_NOT_FINISHED).toBeTruthy();
    expect(pt.game2048.errors.SESSION_NOT_FINISHED).toBeTruthy();
    expect(es.game2048.errors.SESSION_NOT_FINISHED).toBeTruthy();
    expect(en.game2048.open_game).toBeTruthy();
    expect(pt.game2048.open_game).toBeTruthy();
    expect(es.game2048.open_game).toBeTruthy();
    expect(en.auth.turnstile.human_prompt).toBeTruthy();
    expect(pt.auth.turnstile.human_prompt).toBeTruthy();
    expect(es.auth.turnstile.human_prompt).toBeTruthy();
    expect(en.game2048.starting).toBeTruthy();
    expect(pt.game2048.starting).toBeTruthy();
    expect(es.game2048.starting).toBeTruthy();
    expect(en.game2048.grid_loading_aria).toBeTruthy();
    expect(pt.game2048.grid_loading_aria).toBeTruthy();
    expect(es.game2048.grid_loading_aria).toBeTruthy();
    expect(en.game2048.grid_placeholder_aria).toBeTruthy();
    expect(pt.game2048.grid_placeholder_aria).toBeTruthy();
    expect(es.game2048.grid_placeholder_aria).toBeTruthy();
    expect(en.game2048.reward_line_hours).toBeTruthy();
    expect(pt.game2048.reward_line_hours).toBeTruthy();
    expect(es.game2048.reward_line_hours).toBeTruthy();
    expect(en.game2048.claimed_toast_hours).toBeTruthy();
    expect(pt.game2048.claimed_toast_hours).toBeTruthy();
    expect(es.game2048.claimed_toast_hours).toBeTruthy();
  });

  it("exposes security API error strings in en, pt-BR, and es", () => {
    expect(en.errors.security.RACE_CONDITION_DETECTED).toBeTruthy();
    expect(pt.errors.security.RACE_CONDITION_DETECTED).toBeTruthy();
    expect(es.errors.security.RACE_CONDITION_DETECTED).toBeTruthy();
    expect(en.errors.security.IDEMPOTENT_REPLAY).toBeTruthy();
    expect(pt.errors.security.IDEMPOTENT_REPLAY).toBeTruthy();
    expect(es.errors.security.IDEMPOTENT_REPLAY).toBeTruthy();
    expect(en.errors.security.INVALID_STATE).toBeTruthy();
    expect(pt.errors.security.INVALID_STATE).toBeTruthy();
    expect(es.errors.security.INVALID_STATE).toBeTruthy();
    expect(en.errors.security.ACCOUNT_LOCKED).toBeTruthy();
    expect(pt.errors.security.ACCOUNT_LOCKED).toBeTruthy();
    expect(es.errors.security.ACCOUNT_LOCKED).toBeTruthy();
    expect(en.errors.security.TOO_MANY_REQUESTS).toBeTruthy();
    expect(pt.errors.security.TOO_MANY_REQUESTS).toBeTruthy();
    expect(es.errors.security.TOO_MANY_REQUESTS).toBeTruthy();
    expect(en.errors.security.INVALID_REQUEST_SIGNATURE).toBeTruthy();
    expect(pt.errors.security.INVALID_REQUEST_SIGNATURE).toBeTruthy();
    expect(es.errors.security.INVALID_REQUEST_SIGNATURE).toBeTruthy();
    expect(en.errors.security.HTTPS_REQUIRED).toBeTruthy();
    expect(pt.errors.security.HTTPS_REQUIRED).toBeTruthy();
    expect(es.errors.security.HTTPS_REQUIRED).toBeTruthy();
  });

  it("exposes faucet permanent equipment note in en, pt-BR, and es", () => {
    expect(en.faucet.permanent_equipment_note).toBeTruthy();
    expect(pt.faucet.permanent_equipment_note).toBeTruthy();
    expect(es.faucet.permanent_equipment_note).toBeTruthy();
  });
});
