// File: leave.js
const { EmbedBuilder } = require("discord.js");
const handler = require("../Data/handlerData"); // pakai handlerData.js

module.exports = {
name: "leave",
description: "Exit Handler State - TotalDone reduced according to currentJob",

async execute(interaction) {  
    try {  
        // Biar gak timeout  
        await interaction.deferReply();  

        // ================= AMBIL DATA HANDLER LANGSUNG DARI MAP =================  
        const allHandlers = handler.getAllHandlers();  
        const data = allHandlers[interaction.user.id];  

        if (!data) {  
            const embed = new EmbedBuilder()  
                .setColor(0x5865F2)  
                .setTitle("❌ Leave Gagal")  
                .setDescription("You have not joined as a handler, you cannot leave..");  

            return interaction.editReply({ embeds: [embed] });  
        }  

        // ================= HITUNG TOTAL DONE BARU SESUAI CURRENT JOB =================  
        const currentTotalDone = data.totalDone || 0;  
        const currentJob = data.currentJob || data.jobs.length || 0;  
        let newTotalDone = currentTotalDone;  

        if (currentJob > 0) {  
            newTotalDone = Math.max(0, currentTotalDone - currentJob);  
            data.totalDone = newTotalDone; // update dulu ke Map & JSON  
            handler.saveData();  
        }  

        // ================= RESET JOBS, MAXJOB, SERVICES =================  
        data.jobs = [];  
        data.maxJob = 0;  
        data.currentJob = 0;  
        data.services = [];  

        // ================= SIMPAN KEMBALI =================  
        handler.saveData();  

        // ================= EMBED BALAS KE USER =================  
        const embed = new EmbedBuilder()  
            .setColor(0x5865F2)  
            .setTitle("✅ Handler Left")  
            .setDescription(  
`👤 **Handler :**
 ${interaction.user} 
Hooray you successfully exited the handler state. 
📊 **Total Done :** ${newTotalDone} 
⚠️ All unfinished jobs have been deducted from Total Done.`);

        await interaction.editReply({ embeds: [embed] });  

    } catch (error) {  
        console.error("LEAVE ERROR:", error);  

        if (!interaction.replied && !interaction.deferred) {  
            await interaction.reply({  
                content: "❌ Terjadi error pada sistem.",  
                ephemeral: true  
            });  
        } else if (interaction.deferred && !interaction.replied) {  
            await interaction.editReply({  
                content: "❌ Terjadi error setelah proses."  
            });  
        }  
    }  
}  
};