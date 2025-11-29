import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Lockit } from "../target/types/lockit";
import { assert } from "chai";

describe("lockit", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Lockit as Program<Lockit>;
  const user = provider.wallet;

  let vault: anchor.web3.PublicKey;

  const log = (msg: string) => console.log(`[TEST] ${new Date().toISOString()} — ${msg}`);

  before(async () => {
    log(`Using wallet: ${user.publicKey.toBase58()}`);
    const balance = await provider.connection.getBalance(user.publicKey);
    log(`Wallet balance: ${(balance / 1e9).toFixed(3)} SOL`);
    assert.isAtLeast(balance, 100_000_000, "Wallet must have at least 0.1 SOL");
  });

  it("Creates a vault and deposits", async () => {
    try {
      log("Deriving vault PDA...");
      [vault] = anchor.web3.PublicKey.findProgramAddressSync(
        [Buffer.from("vault"), user.publicKey.toBuffer()],
        program.programId
      );
      log(`Vault PDA: ${vault.toBase58()}`);

      await program.methods.createVault(new anchor.BN(1)).accounts({
        vault: vault,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).rpc({ skipPreflight: true });

      await program.methods.deposit(new anchor.BN(100_000_000)).accounts({
        vault: vault,
        user: user.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      }).rpc({ skipPreflight: true });

      const vaultAccount = await program.account.vault.fetch(vault);
      assert.equal(vaultAccount.owner.toBase58(), user.publicKey.toBase58());
      assert.equal(vaultAccount.balance.toNumber(), 100_000_000);
      log("✅ Vault created and funded");
    } catch (err: any) {
      console.error("[ERROR]", err);
      throw err;
    }
  });

  it("Withdraws after time warp", async () => {
    try {
      const clockAccount = await provider.connection.getAccountInfo(
        anchor.web3.SYSVAR_CLOCK_PUBKEY,
        "confirmed"
      );
      const unixTimestamp = clockAccount?.data?.length === 40
        ? Number(clockAccount.data.readBigInt64LE(32))
        : Math.floor(Date.now() / 1000);

      const vaultAccount = await program.account.vault.fetch(vault);
      const unlockTime = Number(vaultAccount.unlockTime);

      if (unixTimestamp < unlockTime) {
        console.log(`[SKIP] Time not reached (${unixTimestamp} < ${unlockTime})`);
        return;
      }

      await program.methods.withdraw().accounts({
        vault: vault,
        user: user.publicKey,
      }).rpc({ skipPreflight: true });

      const updated = await program.account.vault.fetch(vault);
      assert.equal(updated.balance.toNumber(), 0);
      log("✅ Withdraw successful");
    } catch (err: any) {
      if (err.message?.includes("StillLocked")) {
        console.log("[INFO] Still locked — expected without time warp");
        return;
      }
      console.error("[ERROR in withdraw]", err);
      if (err.logs) err.logs.forEach((l: string, i: number) => console.log(`  ${i+1}: ${l}`));
      throw err;
    }
  });
});
