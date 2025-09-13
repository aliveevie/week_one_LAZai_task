import { config } from 'dotenv'
import { Client } from 'alith/lazai'
import { PinataIPFS } from 'alith/data/storage'
import { encrypt } from 'alith/data'
import NodeRSA from 'node-rsa'
import axios from 'axios'
import { promises as fs } from 'fs'

// Load environment variables
config()
 
async function main() {
  try {
    // Check for required environment variables
    let privateKey = process.env.PRIVATE_KEY
    const ipfsJwt = process.env.IPFS_JWT
    
    if (!privateKey) {
      throw new Error('PRIVATE_KEY environment variable is required')
    }
    
    // Ensure private key has 0x prefix
    if (!privateKey.startsWith('0x')) {
      privateKey = '0x' + privateKey
    }
    
    console.log('✅ Private key formatted:', privateKey.substring(0, 10) + '...')
    
    if (!ipfsJwt) {
      console.warn('Warning: IPFS_JWT environment variable not set. IPFS operations may fail.')
    }
    
    // Initialize client with private key as third parameter
    const client = new Client(undefined, undefined, privateKey)
    const ipfs = new PinataIPFS()
    
    console.log('✅ Client initialized successfully')
    console.log('✅ IPFS client initialized successfully')
    
    // 1. Prepare your privacy data and encrypt it
    const dataFileName = 'lazai_encrypted_data.json'
    
    // Create meaningful data structure for DAT (Decentralized AI Training)
    const privacyData = JSON.stringify({
      timestamp: new Date().toISOString(),
      dataType: 'training_data',
      content: {
        userPreferences: {
          language: 'en',
          region: 'US',
          interests: ['AI', 'blockchain', 'privacy']
        },
        behavioralData: {
          sessionDuration: 45,
          interactionCount: 12,
          featureUsage: ['search', 'recommendations', 'analytics']
        },
        personalMetrics: {
          age: 28,
          profession: 'software_engineer',
          experience: 'intermediate'
        }
      },
      metadata: {
        version: '1.0',
        source: 'lazai_contribution',
        encryptionMethod: 'AES-256-GCM'
      }
    })
    
    const encryptionSeed = 'LazAI_DAT_Encryption_Key_2024'
    const password = client.getWallet().sign(encryptionSeed).signature
    const encryptedData = await encrypt(Uint8Array.from(privacyData), password)
    
    console.log('✅ Data encrypted successfully')
    
    // 2. Upload the privacy data to IPFS and get the shared url
    const fileMeta = await ipfs.upload({
      name: dataFileName,
      data: Buffer.from(encryptedData),
      token: ipfsJwt || '',
    })
    const url = await ipfs.getShareLink({ token: ipfsJwt || '', id: fileMeta.id })
    
    console.log('✅ File uploaded to IPFS:', url)
    
    // 3. Upload the privacy url to LazAI
    let fileId = await client.getFileIdByUrl(url)
    if (fileId == BigInt(0)) {
      fileId = await client.addFile(url)
    }
    
    console.log('✅ File registered with LazAI, file ID:', fileId.toString())
    
    // 4. Request proof in the verified computing node
    await client.requestProof(fileId, BigInt(100))
    const jobIds = await client.fileJobIds(fileId)
    const jobId = jobIds[jobIds.length - 1]
    const job = await client.getJob(jobId)
    const nodeInfo = await client.getNode(job.nodeAddress)
    const nodeUrl = nodeInfo.url
    const pubKey = nodeInfo.publicKey
    const rsa = new NodeRSA(pubKey, 'pkcs1-public-pem')
    const encryptedKey = rsa.encrypt(password, 'hex')
    const proofRequest = {
      job_id: Number(jobId),
      file_id: Number(fileId),
      file_url: url,
      encryption_key: encryptedKey,
      encryption_seed: encryptionSeed,
      nonce: null,
      proof_url: null,
    }

    console.log('✅ Proof request prepared')

    // Write proof request to file
    await fs.writeFile('proof_request.json', JSON.stringify(proofRequest, null, 2))
    console.log('✅ Proof request saved to proof_request.json')
    
    const response = await axios.post(`${nodeUrl}/proof`, proofRequest, {
      headers: { 'Content-Type': 'application/json' },
    })
   
    if (response.status === 200) {
      console.log('✅ Proof request sent successfully')
    } else {
      console.log('❌ Failed to send proof request:', response.data)
    }
    
    // 5. Request DAT reward
    await client.requestReward(fileId)
    console.log('✅ Reward requested for file id', fileId.toString())
    
    console.log('All operations completed successfully!')
    
  } catch (error) {
    console.error('❌ Error in main function:', error)
    process.exit(1)
  }
}

// Execute the main function
main().catch((error) => {
  console.error('❌ Unhandled error:', error)
  process.exit(1)
})