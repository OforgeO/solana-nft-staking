import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { TokenStakeModel } from '../target/types/token_stake_model';
import { TOKEN_PROGRAM_ID, Token, ASSOCIATED_TOKEN_PROGRAM_ID, } from '@solana/spl-token';
import { assert } from "chai";
import invariant from "tiny-invariant";
import { PublicKey, SystemProgram, Transaction } from '@solana/web3.js';
import { BalanceTree } from "./balance-tree";

const SPL_REWARD_DECIMAL = 6;
describe('token-stake-model', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.Provider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TokenStakeModel as Program<TokenStakeModel>;

  let mintNFT = null; 
  let lpTokenMint = null;
  let nft_vault_pda = null;
  let lp_token_pda = null;
  let user_stake_pda = null;
  let nft_vault_bump = null;
  let lp_token_bump = null;
  let user_stake_bump = null;
  let userNftTokenAccount = null;
  let userLpTokenAccount = null;
  let nft_auth_pda = null;
  let nft_auth_bump = null;
  let merkle_pda = null;
  let merkle_bump = null;
  let rewardNftMint = null;
  let rewardNftTokenAccount = null;
  let userRewardNftTokenAccount = null;

  let leaves: {account: PublicKey}[] = [];
  let tree = null;
  let merkle_hash = null;
  let nftArray = [];

  const payer = anchor.web3.Keypair.generate();
  const nftAuthority = anchor.web3.Keypair.generate();
  const userAccount = anchor.web3.Keypair.generate();
  const treasuryAccount = anchor.web3.Keypair.generate(); // The account who should have fee(0.05 SOL)

  it('Is initialized!', async () => {

    // Airdrop 1 SOL to payer
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(payer.publicKey, 3000000000),
      "confirmed"
    ); 

    await provider.send(
      (() => {
        const tx = new Transaction();
        tx.add(
          SystemProgram.transfer({
            fromPubkey: payer.publicKey,
            toPubkey: userAccount.publicKey,
            lamports: 1000000000,
          }),
        );
        return tx;
      })(),
      [payer]
    );

    // Get the authority of NFT
    [nft_auth_pda, nft_auth_bump] = await PublicKey.findProgramAddress([
      Buffer.from("vault-stake-auth"),
    ], program.programId);

    [lp_token_pda, lp_token_bump] = await PublicKey.findProgramAddress([
      Buffer.from("reward-stake-auth"),
    ], program.programId);

    // Create mint nft address; decimal = 0
    mintNFT = await Token.createMint(
      provider.connection,
      payer,
      nftAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID,
    );

    // Create mint Reward nft address
    rewardNftMint = await Token.createMint(
      provider.connection,
      payer,
      nftAuthority.publicKey,
      null,
      0,
      TOKEN_PROGRAM_ID,
    );
    
    // Set the Decimal of Token
    lpTokenMint = await Token.createMint(
      provider.connection,
      payer,
      lp_token_pda,
      null,
      SPL_REWARD_DECIMAL, // Decimal is 6
      TOKEN_PROGRAM_ID,
    );

    // Create token account which can get the NFT
    userNftTokenAccount = await mintNFT.createAccount(userAccount.publicKey);

    rewardNftTokenAccount = await rewardNftMint.createAccount(userAccount.publicKey);
    userRewardNftTokenAccount = await rewardNftMint.createAccount(userAccount.publicKey);

    // // Create the 1 NFT to user account
    await mintNFT.mintTo(
      userNftTokenAccount,
      nftAuthority.publicKey,
      [nftAuthority],
      1
    );

    await rewardNftMint.mintTo(
      rewardNftTokenAccount,
      nftAuthority.publicKey,
      [nftAuthority],
      1
    );


    // Get the pda for vault account which have NFT
    [nft_vault_pda, nft_vault_bump] = await PublicKey.findProgramAddress([
      Buffer.from("vault-stake"),
      mintNFT.publicKey.toBuffer(),
      userAccount.publicKey.toBuffer(),
    ], program.programId);

    // Get the account which have info of staking NFT
    [user_stake_pda, user_stake_bump] = await PublicKey.findProgramAddress([
      Buffer.from("user-stake"),
      mintNFT.publicKey.toBuffer(),
      userAccount.publicKey.toBuffer(),
    ], program.programId);

    await program.rpc.initialize(
      user_stake_bump,
      {
        accounts: {
          userAccount: userAccount.publicKey,
          mintNft: mintNFT.publicKey,
          stakeInfoAccount: user_stake_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [userAccount]
      }
    );

  });

  it('Initialize Merkle tree!', async () => {
    [merkle_pda, merkle_bump] = await PublicKey.findProgramAddress([
      Buffer.from("Merkle"),
      payer.publicKey.toBuffer(),
    ], program.programId);

    const nft1 = anchor.web3.Keypair.generate();
    nftArray = [
      { account: nft1.publicKey},
      { account: mintNFT.publicKey},
    ];

    nftArray.map(x => leaves.push(x));
    tree = new BalanceTree(leaves);
    merkle_hash = tree.getRoot();
    
    
    await program.rpc.initializeMerkle(
      merkle_bump,
      toBytes32Array(merkle_hash),
      {
        accounts: {
          adminAccount: payer.publicKey,
          merkle: merkle_pda,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [payer]
      }
    );
  });

  it('Stake NFT', async () => {
    const proof = tree.getProof(nftArray[1]['account']);
    await program.rpc.stakeNft(
      nft_vault_bump,
      nft_auth_bump,
      proof,
      new anchor.BN(10),
      {
        accounts: {
          userAccount: userAccount.publicKey,
          userNftTokenAccount: userNftTokenAccount,
          nftMint: mintNFT.publicKey,
          nftVaultAccount: nft_vault_pda,
          nftAuthority: nft_auth_pda,
          stakeInfoAccount: user_stake_pda,
          merkle: merkle_pda,
          treasuryAccount: treasuryAccount.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          rent: anchor.web3.SYSVAR_RENT_PUBKEY,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [userAccount]
      }
    );

    let _userNFTAccount = await mintNFT.getAccountInfo(userNftTokenAccount);
    assert.ok(_userNFTAccount.amount.toNumber() == 0);

    let _vault = await mintNFT.getAccountInfo(nft_vault_pda);
    assert.ok(_vault.amount.toNumber() == 1);
  });

  it('Get All stacked NFTs', async () => {

  });

  it('Unstake NFT', async () => {
    const proof = tree.getProof(nftArray[1]['account']);
    await program.rpc.unstakeNft(
      proof,
      {
        accounts: {
          userAccount: userAccount.publicKey,
          userNftTokenAccount: userNftTokenAccount,
          nftMint: mintNFT.publicKey,
          nftVaultAccount: nft_vault_pda,
          stakeInfoAccount: user_stake_pda,
          vaultAuth: nft_auth_pda,
          merkle: merkle_pda,
          treasuryAccount: treasuryAccount.publicKey,
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: anchor.web3.SystemProgram.programId,
        },
        signers: [userAccount]
      }
    );

    // let _userNFTAccount = await mintNFT.getAccountInfo(userNftTokenAccount);
    // assert.ok(_userNFTAccount.amount.toNumber() == 1);

    // let _vault = await mintNFT.getAccountInfo(nft_vault_pda);
    // assert.ok(_vault.amount.toNumber() == 0);
  });

  it('Claim Reward token', async () => {
    // Create lp token account to User
    userLpTokenAccount = await lpTokenMint.createAccount(userAccount.publicKey);

    await program.rpc.claimReward(
      new anchor.BN(0),
      {
        accounts: {
          userAccount: userAccount.publicKey,
          lpTokenMint: lpTokenMint.publicKey,
          userLpAccount: userLpTokenAccount,
          stakeInfoAccount: user_stake_pda,
          lpTokenAuthority: lp_token_pda,
          treasuryAccount: treasuryAccount.publicKey,
          systemProgram: anchor.web3.SystemProgram.programId,
          tokenProgram: TOKEN_PROGRAM_ID,
        },
        signers: [userAccount]
      }
    );
    
  });

});

const toBytes32Array = (b: Buffer): number[] => {
  invariant(b.length <= 32, `invalid length ${b.length}`);
  const buf = Buffer.alloc(32);
  b.copy(buf, 32 - b.length);

  return Array.from(buf);
};
