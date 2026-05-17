export {
  clampLoginIdentifier,
  clampLoginPassword,
  normalizeTwoFactorInput,
  validateLoginIdentifierForSubmit,
  validateLoginPasswordForSubmit,
  validateTwoFactorForSubmit,
  validateLegacyNewPassword,
  LOGIN_IDENTIFIER_MAX_LEN,
  LOGIN_PASSWORD_MAX_LEN,
} from '../../../shared/utils/authInputGuards';
