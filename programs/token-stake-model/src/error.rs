use num_derive::FromPrimitive;
use thiserror::Error;
use solana_program::{decode_error::DecodeError, program_error::ProgramError};

#[derive(Error, Debug, Copy, Clone, FromPrimitive)]
pub enum StakeError {
    #[error("Not enough LP token amount")]
    NotEnoughLP,
    #[error("Whitelist Account is not initialized")]
    NotInit,
    #[error("NFT address is not whitelisted")]
    InvalidToken,
    #[error("Signer Not Token Whitelist Owner")]
    TokenWhitelistNotOwner,
    #[error("Invalid Merkle proof.")]
    InvalidProof,
    #[error("Staking day should be 7 days")]
    StakingDay,
    #[error("You can't stake NFT any more")]
    NoStakeAnyMore,
    #[error("You must wait more days to claim reward")]
    NoCliamRewardNft,
    #[error("You don't have reward NFT")]
    NoRewardNft,
    #[error("You must pay the 0.05 SOL for stake or unstake")]
    NoEnoughSol
}

impl From<StakeError> for ProgramError {
    fn from(e: StakeError) -> Self {
        ProgramError::Custom(e as u32)
    }
}

impl<T> DecodeError<T> for StakeError {
    fn type_of() -> &'static str {
        "Token Sale Error"
    }
}